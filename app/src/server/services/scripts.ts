import type { ScriptStatus } from "@/generated/prisma/enums";
import type { TenantContext } from "@/server/authorization/context";
import { assertCan } from "@/server/authorization/permissions";
import type { Db } from "@/server/db/client";
import { withTenant, type Scoped } from "@/server/db/scope";
import { DEFAULT_RECORDING_DOMAINS, validateHttpsLink } from "@/server/domain/external-link";
import { checkScriptTransition, isScriptEditable } from "@/server/domain/script-state";
import { ConflictError, DomainRuleError, NotFoundError } from "@/server/errors";
import { insertLink } from "@/server/repositories/assets";
import { recordAudit } from "@/server/repositories/audit";
import { getContent } from "@/server/repositories/contents";
import {
  countReceivedRecordings,
  getRecording,
  getScript,
  insertRecording,
  insertScript,
  listRecordings,
  listScripts,
  replaceScenes,
  reviewRecording,
  updateScript,
  type ScriptFields,
} from "@/server/repositories/scripts";

// Roteiros, cenas e gravacoes. Cliente so ve a partir de ENVIADO; so a agencia escreve no roteiro.

export async function createScript(db: Db, ctx: TenantContext, input: ScriptFields & { title: string }) {
  assertCan(ctx, "script:write");
  validateReferences(input.referenceLinks);
  return withTenant(db, ctx, async (s) => {
    if (input.contentId && !(await getContent(s, input.contentId))) throw new NotFoundError();
    const row = await insertScript(s, input);
    await recordAudit(s, { action: "script.created", entityType: "script", entityId: row.id });
    return row;
  });
}

function validateReferences(links?: string[]) {
  for (const l of links ?? []) if (!validateHttpsLink(l).ok) throw new DomainRuleError("INVALID_LINK", "Referencia precisa ser um link HTTPS valido.");
}

export async function editScript(db: Db, ctx: TenantContext, scriptId: string, patch: ScriptFields, scenes?: { dialogue?: string; action?: string; durationSeconds?: number }[]) {
  assertCan(ctx, "script:write");
  validateReferences(patch.referenceLinks);
  return withTenant(db, ctx, async (s) => {
    const script = await getScript(s, scriptId);
    if (!script) throw new NotFoundError();
    if (!isScriptEditable(script.status)) throw new DomainRuleError("SCRIPT_LOCKED", "So se edita roteiro em RASCUNHO.");
    await updateScript(s, scriptId, patch);
    if (scenes) await replaceScenes(s, scriptId, scenes);
  });
}

export async function listScriptsFor(db: Db, ctx: TenantContext) {
  return withTenant(db, ctx, (s) => listScripts(s));
}

export async function getScriptDetail(db: Db, ctx: TenantContext, scriptId: string) {
  return withTenant(db, ctx, async (s) => {
    const script = await getScript(s, scriptId);
    if (!script) throw new NotFoundError();
    return { script, recordings: await listRecordings(s, scriptId) };
  });
}

async function moveScript(s: Scoped, scriptId: string, to: ScriptStatus, opts: { rerecording?: boolean; justification?: string } = {}) {
  const script = await getScript(s, scriptId);
  if (!script) throw new NotFoundError();
  const linked = script.contentId ? await getContent(s, script.contentId) : null;
  const r = checkScriptTransition({
    from: script.status,
    to,
    rerecording: opts.rerecording,
    justification: opts.justification,
    linkedContentStatus: linked?.status ?? null,
    hasReceivedRecording: (await countReceivedRecordings(s, scriptId)) > 0,
  });
  if (!r.ok) throw new DomainRuleError(r.code, r.message, r.allowed);
  await updateScript(s, scriptId, { status: to });
  await recordAudit(s, { action: "script.status_changed", entityType: "script", entityId: scriptId, diff: { from: script.status, to, rerecording: opts.rerecording === true } });
}

export async function transitionScript(db: Db, ctx: TenantContext, scriptId: string, to: ScriptStatus, opts: { rerecording?: boolean; justification?: string } = {}) {
  assertCan(ctx, "script:write");
  return withTenant(db, ctx, (s) => moveScript(s, scriptId, to, opts));
}

// ---------- Gravacoes ----------

export interface SubmitRecordingInput {
  scriptId: string;
  /** Arquivo ja DISPONIVEL (asset do mesmo cliente) ou link HTTPS de dominio autorizado. */
  assetId?: string;
  url?: string;
  imageRightsConfirmed?: boolean;
  allowedDomains?: readonly string[];
  now?: Date;
}

export async function submitRecording(db: Db, ctx: TenantContext, input: SubmitRecordingInput) {
  assertCan(ctx, "recording:submit");
  if ((input.assetId ? 1 : 0) + (input.url ? 1 : 0) !== 1) throw new DomainRuleError("RECORDING_SOURCE", "Informe um arquivo OU um link.");
  let externalUrl: string | undefined;
  if (input.url) {
    const link = validateHttpsLink(input.url, { allowedDomains: input.allowedDomains ?? DEFAULT_RECORDING_DOMAINS });
    if (!link.ok) throw new DomainRuleError("INVALID_LINK", `Link recusado (${link.reason}).`);
    externalUrl = link.href;
  }
  return withTenant(db, ctx, async (s) => {
    const script = await getScript(s, input.scriptId);
    if (!script) throw new NotFoundError();
    if (script.status !== "AGUARDANDO_GRAVACAO") throw new ConflictError("NOT_AWAITING_RECORDING", "O roteiro nao esta aguardando gravacao.");
    const rec = await insertRecording(s, {
      scriptId: input.scriptId,
      kind: input.assetId ? "ARQUIVO" : "LINK",
      externalUrl,
      imageRightsConfirmedAt: input.imageRightsConfirmed ? (input.now ?? new Date()) : undefined,
    });
    if (input.assetId) await insertLink(s, { assetId: input.assetId, role: "GRAVACAO", recordingId: rec.id });
    await recordAudit(s, { action: "recording.submitted", entityType: "recording", entityId: rec.id, diff: { scriptId: input.scriptId, kind: rec.kind } });
    return { id: rec.id };
  });
}

/** Agencia confirma o recebimento: gravacao RECEBIDA e roteiro em GRAVACAO_RECEBIDA, com autor e horario auditados. */
export async function confirmRecording(db: Db, ctx: TenantContext, recordingId: string, now: Date = new Date()) {
  assertCan(ctx, "recording:review");
  return withTenant(db, ctx, async (s) => {
    const rec = await getRecording(s, recordingId);
    if (!rec) throw new NotFoundError();
    if ((await reviewRecording(s, recordingId, ["ENVIADA"], { status: "RECEBIDA", reviewedAt: now })) !== 1) {
      throw new ConflictError("RECORDING_NOT_PENDING", "A gravacao nao esta aguardando confirmacao.");
    }
    await moveScript(s, rec.scriptId, "GRAVACAO_RECEBIDA");
    await recordAudit(s, { action: "recording.confirmed", entityType: "recording", entityId: recordingId, diff: { scriptId: rec.scriptId, at: now.toISOString() } });
  });
}

export async function requestRerecording(db: Db, ctx: TenantContext, recordingId: string, justification: string, now: Date = new Date()) {
  assertCan(ctx, "recording:review");
  const feedback = justification.trim();
  if (feedback.length < 10) throw new DomainRuleError("REASON_REQUIRED", "O pedido de regravacao exige justificativa de pelo menos 10 caracteres.");
  return withTenant(db, ctx, async (s) => {
    const rec = await getRecording(s, recordingId);
    if (!rec) throw new NotFoundError();
    if ((await reviewRecording(s, recordingId, ["ENVIADA", "RECEBIDA"], { status: "REGRAVACAO_SOLICITADA", feedback, reviewedAt: now })) !== 1) {
      throw new ConflictError("RECORDING_NOT_REVIEWABLE", "A gravacao nao pode receber este pedido.");
    }
    const script = await getScript(s, rec.scriptId);
    if (script && script.status !== "AGUARDANDO_GRAVACAO") await moveScript(s, rec.scriptId, "AGUARDANDO_GRAVACAO", { rerecording: true, justification: feedback });
    await recordAudit(s, { action: "recording.rerecording_requested", entityType: "recording", entityId: recordingId, diff: { scriptId: rec.scriptId } });
  });
}
