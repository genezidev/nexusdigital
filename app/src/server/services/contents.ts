import { Prisma } from "@/generated/prisma/client";
import type { Channel, ContentFormat, ContentStatus, Visibility } from "@/generated/prisma/enums";
import type { TenantContext } from "@/server/authorization/context";
import { assertCan, isAgency } from "@/server/authorization/permissions";
import type { Db } from "@/server/db/client";
import { withTenant, type Scoped } from "@/server/db/scope";
import {
  MIN_REASON_LENGTH,
  checkContentTransition,
  checkReschedule,
  classifyContentEdit,
  statusAfterVersionSent,
} from "@/server/domain/content-state";
import { ConflictError, DomainRuleError, NotFoundError } from "@/server/errors";
import { recordAudit } from "@/server/repositories/audit";
import { countEvidence } from "@/server/repositories/assets";
import { getCycle } from "@/server/repositories/cycles";
import {
  countRevisionRequests,
  findActiveApproval,
  getContent,
  getDraftVersion,
  insertApproval,
  insertComment,
  insertContent,
  insertVersion,
  lastVersionNumber,
  listApprovals,
  listComments,
  listContents,
  listVersions,
  setClassification,
  setStatusAsClientDecision,
  setVisibility,
  updateContent,
  updateDraftVersion,
  type CommentTarget,
  type ContentFilter,
  type VersionMaterial,
} from "@/server/repositories/contents";
import { getSubscription } from "@/server/repositories/subscriptions";
import { getScript } from "@/server/repositories/scripts";

// Conteudo, versoes, aprovacao e comentarios. Regras de estado vem do dominio puro; aqui so orquestra,
// confere permissao (R-2) e grava auditoria na mesma transacao.

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Serializa tudo que muda um conteudo (envio de versao, aprovacao, cancelamento): trava consultiva por conteudo. */
async function lockContent(s: Scoped, contentId: string) {
  await s.tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${contentId}, 0))`;
}

async function requireContent(s: Scoped, contentId: string) {
  const row = await s.tx.content.findFirst({ where: { id: contentId, clientId: s.ctx.clientId } });
  if (!row) throw new NotFoundError();
  return row;
}

export interface NewContentInput {
  cycleId: string;
  title: string;
  description?: string;
  format: ContentFormat;
  channel?: Channel;
  objective?: string;
  pillar?: string;
  plannedOn: Date;
  assigneeId?: string;
  /** Padrao: Story nao conta na cota; os demais contam. So o ADMIN muda depois. */
  countsTowardQuota?: boolean;
}

export async function createContent(db: Db, ctx: TenantContext, input: NewContentInput) {
  assertCan(ctx, "content:write");
  return withTenant(db, ctx, async (s) => {
    const cycle = await getCycle(s, input.cycleId);
    if (!cycle) throw new NotFoundError();
    if (cycle.status !== "ABERTO") throw new DomainRuleError("CYCLE_CLOSED", "Ciclo encerrado nao recebe conteudo novo.");
    if (input.plannedOn.getUTCFullYear() !== cycle.year || input.plannedOn.getUTCMonth() + 1 !== cycle.month) {
      throw new DomainRuleError("OUTSIDE_CYCLE_MONTH", "A data prevista precisa ficar dentro do mes do ciclo.");
    }
    const counts = input.format === "STORY" ? false : (input.countsTowardQuota ?? true);
    if (counts !== (input.format !== "STORY")) assertCan(ctx, "content:classify");
    const row = await insertContent(s, { ...input, channel: input.channel ?? "INSTAGRAM", countsTowardQuota: counts });
    await recordAudit(s, { action: "content.created", entityType: "content", entityId: row.id, diff: { format: row.format, countsTowardQuota: counts, plannedOn: iso(row.plannedOn) } });
    return row;
  });
}

export async function listContentsFor(db: Db, ctx: TenantContext, filter?: ContentFilter) {
  return withTenant(db, ctx, (s) => listContents(s, filter));
}

/** Conteudo com versoes, aprovacoes e comentarios ja filtrados para quem pede (cliente: so o compartilhado). */
export async function getContentDetail(db: Db, ctx: TenantContext, contentId: string) {
  return withTenant(db, ctx, async (s) => {
    const content = await getContent(s, contentId);
    if (!content) throw new NotFoundError();
    const [versions, approvals, comments] = await Promise.all([
      listVersions(s, contentId),
      listApprovals(s, contentId),
      listComments(s, { contentId }),
    ]);
    return { content, versions, approvals, comments };
  });
}

export async function updatePlanning(
  db: Db,
  ctx: TenantContext,
  contentId: string,
  patch: { title?: string; description?: string | null; pillar?: string | null; objective?: string | null; internalNotes?: string | null; assigneeId?: string | null; assigneeVisibleToClient?: boolean },
  today: Date = new Date(),
) {
  assertCan(ctx, "content:write");
  void today;
  return withTenant(db, ctx, async (s) => {
    const content = await requireContent(s, contentId);
    const outcome = classifyContentEdit(content.status, Object.keys(patch));
    if (!outcome.ok) throw new DomainRuleError(outcome.code, outcome.message);
    await updateContent(s, contentId, patch);
  });
}

export async function rescheduleContent(db: Db, ctx: TenantContext, contentId: string, newDate: string, today: Date = new Date()) {
  assertCan(ctx, "content:write");
  return withTenant(db, ctx, async (s) => {
    const content = await requireContent(s, contentId);
    const cycle = await getCycle(s, content.cycleId);
    if (!cycle) throw new NotFoundError();
    const r = checkReschedule({ status: content.status, cycleYear: cycle.year, cycleMonth: cycle.month, newDate, today: iso(today) });
    if (!r.ok) throw new DomainRuleError(r.code, r.message);
    await updateContent(s, contentId, { plannedOn: new Date(`${newDate}T00:00:00.000Z`) });
    await recordAudit(s, { action: "content.rescheduled", entityType: "content", entityId: contentId, diff: { from: iso(content.plannedOn), to: newDate } });
  });
}

/** Classificacao de cota (conta / bonus): so ADMIN, com auditoria do antes e depois. */
export async function classifyContent(db: Db, ctx: TenantContext, contentId: string, patch: { countsTowardQuota?: boolean; isBonus?: boolean }) {
  assertCan(ctx, "content:classify");
  return withTenant(db, ctx, async (s) => {
    const content = await requireContent(s, contentId);
    await setClassification(s, contentId, patch);
    await recordAudit(s, {
      action: "content.classification_changed",
      entityType: "content",
      entityId: contentId,
      diff: { from: { countsTowardQuota: content.countsTowardQuota, isBonus: content.isBonus }, to: patch },
    });
  });
}

export async function moveContentToCycle(db: Db, ctx: TenantContext, contentId: string, cycleId: string, reason: string) {
  assertCan(ctx, "cycle:manage");
  if (reason.trim().length < MIN_REASON_LENGTH) throw new DomainRuleError("REASON_REQUIRED", "Mover de ciclo exige justificativa.");
  return withTenant(db, ctx, async (s) => {
    const content = await requireContent(s, contentId);
    if (!(await getCycle(s, cycleId))) throw new NotFoundError();
    await updateContent(s, contentId, { cycleId });
    await recordAudit(s, { action: "content.cycle_changed", entityType: "content", entityId: contentId, diff: { from: content.cycleId, to: cycleId } });
  });
}

export async function shareContent(db: Db, ctx: TenantContext, contentId: string, visibility: Visibility) {
  assertCan(ctx, "content:write");
  return withTenant(db, ctx, async (s) => {
    const content = await requireContent(s, contentId);
    if (content.status === "CANCELADO") throw new DomainRuleError("TERMINAL", "Conteudo cancelado nao muda.");
    await setVisibility(s, contentId, visibility);
    await recordAudit(s, { action: "content.visibility_changed", entityType: "content", entityId: contentId, diff: { from: content.visibility, to: visibility } });
  });
}

// ---------- Versoes ----------

/**
 * Edita o material. Em producao/planejado/em revisao grava o RASCUNHO; depois do envio (aguardando, aprovado,
 * agendado) nasce NOVA versao ja enviada, copiando os vinculos de arquivo da atual, e a aprovacao anterior e
 * invalidada pelo proprio banco (gatilho de contents). Publicado/analisado: recusado.
 */
export async function editMaterial(db: Db, ctx: TenantContext, contentId: string, material: VersionMaterial & { format?: ContentFormat; channel?: Channel }) {
  assertCan(ctx, "content:write");
  const { format, channel, ...versionFields } = material;
  const changed = [...Object.keys(versionFields), ...(format ? ["format"] : []), ...(channel ? ["channel"] : [])];
  return withTenant(db, ctx, async (s) => {
    await lockContent(s, contentId);
    const content = await requireContent(s, contentId);
    const outcome = classifyContentEdit(content.status, changed);
    if (!outcome.ok) throw new DomainRuleError(outcome.code, outcome.message);
    if (outcome.kind === "planning") throw new DomainRuleError("NOT_MATERIAL", "Nada de material para editar.");
    if (format || channel) await updateContent(s, contentId, { ...(format ? { format } : {}), ...(channel ? { channel } : {}) });

    if (outcome.mode === "edit_draft") {
      const draft = await getDraftVersion(s, contentId);
      if (draft) {
        await updateDraftVersion(s, draft.id, versionFields);
        return { versionId: draft.id, mode: outcome.mode };
      }
      const created = await insertVersion(s, { ...versionFields, contentId, number: (await lastVersionNumber(s, contentId)) + 1, status: "RASCUNHO" });
      return { versionId: created.id, mode: outcome.mode };
    }

    // Material depois do envio: nova versao ENVIADA (parte da atual, aplica a mudanca, copia os vinculos).
    const current = content.currentVersionId ? await s.tx.contentVersion.findFirst({ where: { id: content.currentVersionId, clientId: s.ctx.clientId } }) : null;
    const created = await insertVersion(s, {
      caption: current?.caption,
      cta: current?.cta,
      hashtags: current?.hashtags,
      briefing: current?.briefing,
      ...versionFields,
      contentId,
      number: (await lastVersionNumber(s, contentId)) + 1,
      status: "RASCUNHO",
    });
    if (current) {
      const links = await s.tx.assetLink.findMany({ where: { clientId: s.ctx.clientId, versionId: current.id } });
      for (const l of links) await s.tx.assetLink.create({ data: { clientId: l.clientId, assetId: l.assetId, versionId: created.id, role: l.role, position: l.position } });
    }
    await publishVersion(s, content, created.id, outcome.nextStatus, outcome.invalidatesApproval ? "edit_after_approval" : "edit_while_waiting");
    return { versionId: created.id, mode: outcome.mode };
  });
}

async function publishVersion(s: Scoped, content: { id: string; status: ContentStatus }, versionId: string, nextStatus: ContentStatus, cause: string) {
  await updateDraftVersion(s, versionId, { status: "ENVIADA", sentAt: new Date() });
  await updateContent(s, content.id, { currentVersionId: versionId, status: nextStatus });
  const v = await s.tx.contentVersion.findFirstOrThrow({ where: { id: versionId, clientId: s.ctx.clientId }, select: { number: true } });
  await recordAudit(s, { action: "content.version_sent", entityType: "content", entityId: content.id, diff: { versionId, number: v.number, from: content.status, to: nextStatus, cause } });
}

/** Envia o rascunho para aprovacao: a versao fica imutavel, vira a atual e o conteudo entra na fila do cliente. */
export async function sendVersion(db: Db, ctx: TenantContext, contentId: string) {
  assertCan(ctx, "content:write");
  return withTenant(db, ctx, async (s) => {
    await lockContent(s, contentId);
    const content = await requireContent(s, contentId);
    const next = statusAfterVersionSent(content.status);
    if (!next) throw new DomainRuleError("INVALID_TRANSITION", `Nao ha envio de versao a partir de ${content.status}.`);
    const draft = await getDraftVersion(s, contentId);
    if (!draft) throw new DomainRuleError("NO_DRAFT", "Nao ha rascunho para enviar.");
    await publishVersion(s, content, draft.id, next, "send");
    return { versionId: draft.id, status: next };
  });
}

// ---------- Mudanca de status pela agencia (a mao) ----------

export async function transitionContent(
  db: Db,
  ctx: TenantContext,
  contentId: string,
  to: ContentStatus,
  data: { cancelReason?: string; publishedAt?: Date; publicationUrl?: string } = {},
  now: Date = new Date(),
) {
  assertCan(ctx, "content:write");
  return withTenant(db, ctx, async (s) => {
    await lockContent(s, contentId);
    const content = await requireContent(s, contentId);
    const evidenceCount = to === "PUBLICADO" ? await countEvidence(s, contentId) : 0;
    const publicationUrl = data.publicationUrl ?? content.publicationUrl ?? undefined;
    const r = checkContentTransition({
      from: content.status,
      to,
      trigger: "manual",
      cancelReason: data.cancelReason,
      publishedAt: data.publishedAt ?? content.publishedAt,
      publicationUrl,
      evidenceCount,
      channel: content.channel,
    });
    if (!r.ok) throw new DomainRuleError(r.code, r.message, r.allowed);
    const patch: Prisma.ContentUncheckedUpdateManyInput = { status: to };
    if (to === "CANCELADO") Object.assign(patch, { cancelReason: data.cancelReason!.trim(), cancelledAt: now });
    if (to === "PUBLICADO") Object.assign(patch, { publishedAt: data.publishedAt ?? content.publishedAt, publicationUrl: publicationUrl ?? null });
    await updateContent(s, contentId, patch);
    const action = to === "CANCELADO" ? "content.cancelled" : to === "PUBLICADO" ? "content.published" : "content.status_changed";
    await recordAudit(s, { action, entityType: "content", entityId: contentId, diff: { from: content.status, to } });
  });
}

// ---------- Aprovacao pelo cliente ----------

export type DecisionInput = { contentId: string; versionId: string; decision: "APROVADO" | "REVISAO_SOLICITADA"; comment?: string };

/**
 * Decisao do cliente sobre UMA versao. Regra de concorrencia (D-0011): a PRIMEIRA decisao vence. Trava consultiva
 * por conteudo serializa as requisicoes; o indice unico parcial e o gatilho do banco sao a rede de seguranca.
 * Mesma pessoa repetindo a mesma decisao recebe a mesma resposta, sem linha nova.
 */
export async function decideApproval(db: Db, ctx: TenantContext, input: DecisionInput) {
  assertCan(ctx, "content:approve");
  const comment = input.comment?.trim() || undefined;
  if (input.decision === "REVISAO_SOLICITADA" && !comment) throw new DomainRuleError("COMMENT_REQUIRED", "Pedir revisao exige um comentario.");
  try {
    return await withTenant(db, ctx, async (s) => {
      await lockContent(s, input.contentId);
      const content = await getContent(s, input.contentId);
      if (!content) throw new NotFoundError();
      const version = await s.tx.contentVersion.findFirst({ where: { id: input.versionId, clientId: s.ctx.clientId, contentId: input.contentId, status: "ENVIADA" }, select: { id: true, number: true } });
      if (!version) throw new NotFoundError();

      const existing = await findActiveApproval(s, input.versionId);
      if (existing) {
        if (existing.authorId === ctx.userId && existing.decision === input.decision) return { approvalId: existing.id, replayed: true, overRevisionLimit: false };
        throw new ConflictError("ALREADY_DECIDED", `Versao ja decidida por ${existing.author.name} em ${existing.createdAt.toISOString()}.`);
      }
      if (content.currentVersionId !== input.versionId) throw new ConflictError("STALE_VERSION", "Versao desatualizada: recarregue a versao atual.");
      if (content.status !== "AGUARDANDO_APROVACAO") throw new ConflictError("NOT_AWAITING", "O conteudo nao esta aguardando aprovacao.");

      const to: ContentStatus = input.decision === "APROVADO" ? "APROVADO" : "EM_REVISAO";
      const r = checkContentTransition({ from: content.status, to, trigger: "client_decision" });
      if (!r.ok) throw new DomainRuleError(r.code, r.message, r.allowed);
      const approval = await insertApproval(s, { contentId: input.contentId, versionId: input.versionId, decision: input.decision, comment });
      if ((await setStatusAsClientDecision(s, input.contentId, "AGUARDANDO_APROVACAO", to)) !== 1) throw new ConflictError("NOT_AWAITING", "O conteudo mudou durante a decisao.");
      await recordAudit(s, { action: "approval.decided", entityType: "approval", entityId: approval.id, diff: { contentId: input.contentId, versionId: input.versionId, versionNumber: version.number, decision: input.decision } });
      let overRevisionLimit = false;
      if (input.decision === "REVISAO_SOLICITADA") {
        const cycle = await getCycle(s, content.cycleId);
        const sub = cycle ? await getSubscription(s, cycle.subscriptionId) : null;
        overRevisionLimit = !!sub && (await countRevisionRequests(s, input.contentId)) > sub.revisionsPerPiece;
      }
      return { approvalId: approval.id, replayed: false, overRevisionLimit };
    });
  } catch (e) {
    // Rede de seguranca do banco: duas decisoes ativas na mesma versao nunca coexistem.
    if (isUniqueViolation(e)) throw new ConflictError("ALREADY_DECIDED", "Versao ja decidida por outra pessoa.");
    throw e;
  }
}

// ---------- Comentarios ----------

export async function addComment(
  db: Db,
  ctx: TenantContext,
  input: (CommentTarget & { versionId?: string }) & { body: string; visibility: Visibility },
) {
  assertCan(ctx, "comment:create");
  const body = input.body.trim();
  if (body.length < 1 || body.length > 2000) throw new DomainRuleError("INVALID_COMMENT", "O comentario precisa ter de 1 a 2000 caracteres.");
  if (!isAgency(ctx) && input.visibility !== "COMPARTILHADO") assertCan(ctx, "comment:create_internal"); // cliente so cria compartilhado
  return withTenant(db, ctx, async (s) => {
    const visible = input.contentId ? await getContent(s, input.contentId) : await getScript(s, input.scriptId!);
    if (!visible) throw new NotFoundError();
    const row = await insertComment(s, { ...input, body });
    return { id: row.id };
  });
}
