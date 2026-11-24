import "server-only";
import type { NextRequest } from "next/server";
import { assetInitBody, assetListQuery, assetPatchBody, attachBody, reorderBody } from "@/lib/schemas-fase2";
import { isAgency } from "@/server/authorization/permissions";
import { getServerEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { withTenant } from "@/server/db/scope";
import { attachmentDisposition } from "@/server/domain/content-disposition";
import { NotFoundError, UnsupportedMediaTypeError } from "@/server/errors";
import { requireActor } from "@/server/http/actor";
import type { Authorized } from "@/server/http/api";
import { limitByUser, parseQuery, uuid } from "@/server/http/api";
import { assetAgencyOut, assetPortalOut, page } from "@/server/http/dto-fase2";
import { parseBody } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { getAsset } from "@/server/repositories/assets";
import { attachAsset, changeAssetVisibility, detachAsset, reorderAsset } from "@/server/services/assets";
import { deliverDownload, fileDepsFromEnv, receiveUpload, removeAsset, requestDownload, requestUpload } from "@/server/services/files";
import { pageAssetsFor } from "@/server/services/queries";

// Arquivos privados (R-5). Duas portas para o pedido (admin e portal) e UMA para os bytes (/api/files/...), que
// reconfere sessao, vinculo do token e permissao a cada requisicao. Nada daqui serve arquivo sem autorizacao.

const assetOut = (a: Authorized, row: unknown) => (isAgency(a.ctx) ? assetAgencyOut : assetPortalOut).parse(row);
const TEN_MINUTES = 600;

export async function postAssetInit(a: Authorized, req: NextRequest, requestId: string) {
  const env = getServerEnv();
  await limitByUser("upload-init", a.ctx.userId, { windowSeconds: TEN_MINUTES, max: env.UPLOAD_RATE_MAX });
  const body = await parseBody(req, assetInitBody);
  const target = await requestUpload(getDb(), a.ctx, fileDepsFromEnv(), body);
  return json(target, 201, requestId);
}

export async function listAssets(a: Authorized, req: NextRequest, requestId: string) {
  const q = parseQuery(req, assetListQuery);
  const { items, total } = await pageAssetsFor(getDb(), a.ctx, {
    page: q.page,
    pageSize: q.pageSize,
    sort: q.sort,
    dir: q.dir,
    status: q.status,
    category: q.category,
    q: q.q,
    targetVersionId: q.versionId,
    targetScriptId: q.scriptId,
    targetRecordingId: q.recordingId,
  });
  return json(page(items.map((i) => assetOut(a, i)), total, q.page, q.pageSize), 200, requestId);
}

export async function getAssetResponse(a: Authorized, assetId: string, requestId: string) {
  const row = await withTenant(getDb(), a.ctx, (s) => getAsset(s, uuid(assetId)));
  if (!row) throw new NotFoundError();
  return json(assetOut(a, row), 200, requestId);
}

/** Emite o link assinado de download. POST (e nao GET): gasta limite por pessoa e nao pode ser disparado por link. */
export async function postDownloadLink(a: Authorized, assetId: string, requestId: string) {
  const env = getServerEnv();
  await limitByUser("download-link", a.ctx.userId, { windowSeconds: TEN_MINUTES, max: env.DOWNLOAD_RATE_MAX });
  const link = await requestDownload(getDb(), a.ctx, fileDepsFromEnv(), uuid(assetId));
  return json(link, 200, requestId);
}

export async function deleteAssetResponse(a: Authorized, assetId: string, requestId: string) {
  await removeAsset(getDb(), a.ctx, fileDepsFromEnv(), uuid(assetId));
  return json({ ok: true }, 200, requestId);
}

export async function patchAssetResponse(a: Authorized, req: NextRequest, assetId: string, requestId: string) {
  const b = await parseBody(req, assetPatchBody);
  await changeAssetVisibility(getDb(), a.ctx, uuid(assetId), b.visibility);
  return json({ ok: true }, 200, requestId);
}

export async function postAttach(a: Authorized, req: NextRequest, assetId: string, requestId: string) {
  const b = await parseBody(req, attachBody);
  const target = b.versionId ? { versionId: b.versionId } : b.scriptId ? { scriptId: b.scriptId } : b.recordingId ? { recordingId: b.recordingId } : { contentId: b.contentId! };
  const r = await attachAsset(getDb(), a.ctx, { assetId: uuid(assetId), role: b.role, position: b.position, ...target });
  return json(r, 201, requestId);
}

export async function deleteLink(a: Authorized, linkId: string, requestId: string) {
  await detachAsset(getDb(), a.ctx, uuid(linkId));
  return json({ ok: true }, 200, requestId);
}

export async function putLinkPosition(a: Authorized, req: NextRequest, linkId: string, requestId: string) {
  const b = await parseBody(req, reorderBody);
  await reorderAsset(getDb(), a.ctx, uuid(linkId), b.position);
  return json({ ok: true }, 200, requestId);
}

// ---------- bytes: /api/files/upload/[token] e /api/files/download/[token] ----------

/** PUT: o corpo sao os bytes (octet-stream), lidos em streaming. Content-Type nunca decide o tipo do arquivo. */
export async function putUploadBytes(req: NextRequest, token: string, requestId: string) {
  const actor = await requireActor(req.headers);
  const type = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "" && type !== "application/octet-stream") {
    await req.body?.cancel().catch(() => undefined);
    throw new UnsupportedMediaTypeError("Envie os bytes do arquivo como application/octet-stream.", "UNSUPPORTED_MEDIA_TYPE");
  }
  const lengthHeader = req.headers.get("content-length");
  const contentLength = lengthHeader !== null && /^\d{1,15}$/.test(lengthHeader) ? Number(lengthHeader) : null;
  const result = await receiveUpload(getDb(), fileDepsFromEnv(), { token, sessionUserId: actor.userId, body: req.body, contentLength });
  return json(
    { id: result.id, status: result.status, bytes: result.bytes, mimeType: result.mimeType, checksumSha256: result.checksumSha256, replayed: result.replayed },
    result.replayed ? 200 : 201,
    requestId,
  );
}

/** GET: entrega SEMPRE como anexo, com o tipo validado e nosniff; reautoriza a cada requisicao. */
export async function getDownloadBytes(req: NextRequest, token: string, requestId: string) {
  const actor = await requireActor(req.headers);
  const env = getServerEnv();
  await limitByUser("download", actor.userId, { windowSeconds: TEN_MINUTES, max: env.DOWNLOAD_RATE_MAX });
  const file = await deliverDownload(getDb(), fileDepsFromEnv(), { token, sessionUserId: actor.userId });
  return new Response(file.stream, {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.bytes),
      "Content-Disposition": attachmentDisposition(file.originalName),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": "private, no-store",
      "X-Request-Id": requestId,
    },
  });
}
