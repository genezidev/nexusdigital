import "server-only";
import type { NextRequest } from "next/server";
import { recordingBody, rerecordingBody, scriptBody, scriptListQuery, scriptPatchBody, scriptStatusBody, toDay } from "@/lib/schemas-fase2";
import { isAgency } from "@/server/authorization/permissions";
import { getServerEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { DEFAULT_RECORDING_DOMAINS } from "@/server/domain/external-link";
import { NotFoundError } from "@/server/errors";
import type { Authorized } from "@/server/http/api";
import { limitMutation, parseQuery, uuid } from "@/server/http/api";
import { commentRow } from "@/server/http/handlers/content";
import { linkedAssetAgencyOut, linkedAssetPortalOut, mediaLinkAgencyOut, mediaLinkPortalOut, page, recordingOut, scriptAgencyOut, scriptPortalOut } from "@/server/http/dto-fase2";
import { parseBody } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { addComment } from "@/server/services/contents";
import { commentBody } from "@/lib/schemas-fase2";
import { confirmRecording, createScript, editScript, requestRerecording, submitRecording, transitionScript } from "@/server/services/scripts";
import { getScriptView, pageScriptsFor } from "@/server/services/queries";

// Roteiros, cenas e gravacoes. Cliente so ve a partir de ENVIADO (repositorio + RLS); so a agencia escreve no roteiro.

const scriptOut = (a: Authorized, row: unknown) => (isAgency(a.ctx) ? scriptAgencyOut : scriptPortalOut).parse(row);
const recordingRow = (r: Record<string, unknown>) => recordingOut.parse(r);

export async function listScripts(a: Authorized, req: NextRequest, requestId: string) {
  const q = parseQuery(req, scriptListQuery);
  const { items, total } = await pageScriptsFor(getDb(), a.ctx, q);
  return json(page(items.map((i) => scriptOut(a, i)), total, q.page, q.pageSize), 200, requestId);
}

export async function getScriptResponse(a: Authorized, scriptId: string, requestId: string) {
  const v = await getScriptView(getDb(), a.ctx, uuid(scriptId));
  const agency = isAgency(a.ctx);
  return json(
    {
      script: scriptOut(a, v.script),
      recordings: v.recordings.map((r) => recordingRow(r)),
      comments: v.comments.map((c) => commentRow(c)),
      assets: v.assets.map((x) => (agency ? linkedAssetAgencyOut : linkedAssetPortalOut).parse(x)),
      mediaLinks: v.mediaLinks.map((m) => (agency ? mediaLinkAgencyOut : mediaLinkPortalOut).parse(m)),
    },
    200,
    requestId,
  );
}

export async function postScript(a: Authorized, req: NextRequest, requestId: string) {
  const { scenes, deadlineOn, ...rest } = await parseBody(req, scriptBody);
  const row = await createScript(getDb(), a.ctx, { ...rest, deadlineOn: deadlineOn ? toDay(deadlineOn) : deadlineOn === null ? null : undefined });
  if (scenes?.length) await editScript(getDb(), a.ctx, row.id, {}, scenes);
  return json({ id: row.id }, 201, requestId);
}

export async function patchScript(a: Authorized, req: NextRequest, scriptId: string, requestId: string) {
  const { scenes, deadlineOn, ...rest } = await parseBody(req, scriptPatchBody);
  await editScript(getDb(), a.ctx, uuid(scriptId), { ...rest, deadlineOn: deadlineOn ? toDay(deadlineOn) : deadlineOn === null ? null : undefined }, scenes);
  return json({ ok: true }, 200, requestId);
}

export async function postScriptStatus(a: Authorized, req: NextRequest, scriptId: string, requestId: string) {
  const b = await parseBody(req, scriptStatusBody);
  await transitionScript(getDb(), a.ctx, uuid(scriptId), b.to, { rerecording: b.rerecording, justification: b.justification });
  return json({ ok: true, status: b.to }, 200, requestId);
}

export async function postScriptComment(a: Authorized, req: NextRequest, scriptId: string, requestId: string) {
  await limitMutation("comment", a.ctx.userId);
  const b = await parseBody(req, commentBody);
  const r = await addComment(getDb(), a.ctx, {
    scriptId: uuid(scriptId),
    body: b.body,
    visibility: b.visibility ?? (isAgency(a.ctx) ? "INTERNO" : "COMPARTILHADO"),
  });
  return json(r, 201, requestId);
}

export async function postRecording(a: Authorized, req: NextRequest, scriptId: string, requestId: string) {
  await limitMutation("recording", a.ctx.userId);
  const b = await parseBody(req, recordingBody);
  const env = getServerEnv();
  // D-0025: gravacao por arquivo so existe com o envio de arquivo ligado; a por link nao depende dele.
  if (b.assetId && !env.UPLOADS_ENABLED) throw new NotFoundError();
  const r = await submitRecording(getDb(), a.ctx, {
    scriptId: uuid(scriptId),
    assetId: b.assetId,
    url: b.url,
    imageRightsConfirmed: b.imageRightsConfirmed,
    allowedDomains: env.RECORDING_LINK_DOMAINS.length ? env.RECORDING_LINK_DOMAINS : DEFAULT_RECORDING_DOMAINS,
  });
  return json(r, r.replayed ? 200 : 201, requestId);
}

export async function postConfirmRecording(a: Authorized, recordingId: string, requestId: string) {
  await confirmRecording(getDb(), a.ctx, uuid(recordingId));
  return json({ ok: true }, 200, requestId);
}

export async function postRerecording(a: Authorized, req: NextRequest, recordingId: string, requestId: string) {
  const b = await parseBody(req, rerecordingBody);
  await requestRerecording(getDb(), a.ctx, uuid(recordingId), b.justification);
  return json({ ok: true }, 200, requestId);
}
