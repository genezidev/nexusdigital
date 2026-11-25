import "server-only";
import type { NextRequest } from "next/server";
import { mediaLinkBody, mediaLinkListQuery, portalMediaLinkBody } from "@/lib/schemas-fase2";
import { isAgency } from "@/server/authorization/permissions";
import { getServerEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import type { Authorized } from "@/server/http/api";
import { limitMutation, parseQuery, uuid } from "@/server/http/api";
import { mediaLinkAgencyOut, mediaLinkPortalOut } from "@/server/http/dto-fase2";
import { parseBody } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import { createMediaLink, listMediaLinksFor, removeMediaLink } from "@/server/services/media-links";

// Links de midia externos (D-0025, R-23). Duas portas (admin e portal), mesmo servico. Nada aqui abre o endereco.

const out = (a: Authorized, row: unknown) => (isAgency(a.ctx) ? mediaLinkAgencyOut : mediaLinkPortalOut).parse(row);

export async function listLinks(a: Authorized, req: NextRequest, requestId: string) {
  const q = parseQuery(req, mediaLinkListQuery);
  const rows = await listMediaLinksFor(getDb(), a.ctx, q);
  return json({ items: rows.map((r) => out(a, r)) }, 200, requestId);
}

export async function postLinkAdmin(a: Authorized, req: NextRequest, requestId: string) {
  await limitMutation("media-link", a.ctx.userId);
  const b = await parseBody(req, mediaLinkBody);
  const target = b.versionId ? { versionId: b.versionId } : b.scriptId ? { scriptId: b.scriptId } : { recordingId: b.recordingId! };
  const row = await createMediaLink(getDb(), a.ctx, { label: b.label, url: b.url, kind: b.kind, target }, getServerEnv().MEDIA_LINK_EXTRA_HOSTS);
  return json(out(a, row), 201, requestId);
}

/** Portal: a pessoa do cliente so cadastra link na gravacao dela; o cliente do link vem da sessao. */
export async function postLinkPortal(a: Authorized, req: NextRequest, requestId: string) {
  await limitMutation("media-link", a.ctx.userId);
  const b = await parseBody(req, portalMediaLinkBody);
  const row = await createMediaLink(getDb(), a.ctx, { label: b.label, url: b.url, kind: b.kind, target: { recordingId: b.recordingId } }, getServerEnv().MEDIA_LINK_EXTRA_HOSTS);
  return json(out(a, row), 201, requestId);
}

export async function deleteLinkResponse(a: Authorized, id: string, requestId: string) {
  await limitMutation("media-link", a.ctx.userId);
  await removeMediaLink(getDb(), a.ctx, uuid(id));
  return json({ ok: true }, 200, requestId);
}
