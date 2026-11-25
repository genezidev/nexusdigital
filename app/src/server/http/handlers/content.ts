import "server-only";
import type { NextRequest } from "next/server";
import { toDay, calendarQuery, classificationBody, commentBody, contentBody, contentListQuery, decisionBody, materialBody, moveCycleBody, planningPatchBody, rescheduleBody, sendBody, statusBody, visibilityBody } from "@/lib/schemas-fase2";
import { isAgency } from "@/server/authorization/permissions";
import { getDb } from "@/server/db/client";
import { parseBody } from "@/server/http/handler";
import type { Authorized } from "@/server/http/api";
import { limitMutation, parseQuery, uuid } from "@/server/http/api";
import {
  approvalOut,
  calendarItemOut,
  commentOut,
  contentAgencyOut,
  contentPortalOut,
  linkedAssetAgencyOut,
  linkedAssetPortalOut,
  page,
  versionAgencyOut,
  versionPortalOut,
} from "@/server/http/dto-fase2";
import { json } from "@/server/http/respond";
import { addComment, classifyContent, createContent, decideApproval, editMaterial, moveContentToCycle, rescheduleContent, sendVersion, shareContent, transitionContent, updatePlanning } from "@/server/services/contents";
import { calendarFor, getContentView, pageContentsFor } from "@/server/services/queries";

// Conteudo, versoes, aprovacao, comentarios e calendario. Usado pelas duas portas (admin e portal): quem decide o
// que cada pessoa pode fazer e `assertCan` nos servicos e a RLS no banco; o formato de saida depende do lado (agencia
// ou cliente), e o do cliente e a lista explicita da spec.

export const contentOut = (a: Authorized, row: unknown) => (isAgency(a.ctx) ? contentAgencyOut : contentPortalOut).parse(row);
const versionOut = (a: Authorized, row: unknown) => (isAgency(a.ctx) ? versionAgencyOut : versionPortalOut).parse(row);
const assetLinkOut = (a: Authorized, row: unknown) => (isAgency(a.ctx) ? linkedAssetAgencyOut : linkedAssetPortalOut).parse(row);
export const commentRow = (c: { author: { name: string } } & Record<string, unknown>) => commentOut.parse({ ...c, authorName: c.author.name });

export async function listContents(a: Authorized, req: NextRequest, requestId: string, fixed: { status?: "AGUARDANDO_APROVACAO" } = {}) {
  const q = parseQuery(req, contentListQuery);
  const { items, total } = await pageContentsFor(getDb(), a.ctx, {
    page: q.page,
    pageSize: q.pageSize,
    dir: q.dir,
    sort: q.sort,
    status: fixed.status ?? q.status,
    format: q.format,
    cycleId: q.cycleId,
    visibility: q.visibility,
    plannedFrom: q.from ? toDay(q.from) : undefined,
    plannedTo: q.to ? toDay(q.to) : undefined,
    q: q.q,
  });
  return json(page(items.map((i) => contentOut(a, i)), total, q.page, q.pageSize), 200, requestId);
}

export async function getContentDetailResponse(a: Authorized, contentId: string, requestId: string) {
  const v = await getContentView(getDb(), a.ctx, uuid(contentId));
  return json(
    {
      content: contentOut(a, v.content),
      versions: v.versions.map((x) => versionOut(a, x)),
      approvals: v.approvals.map((x) => approvalOut.parse({ ...x, authorName: x.author.name })),
      comments: v.comments.map((c) => commentRow(c)),
      assets: v.assets.map((x) => assetLinkOut(a, x)),
    },
    200,
    requestId,
  );
}

export async function createContentResponse(a: Authorized, req: NextRequest, requestId: string) {
  await limitMutation("content-create", a.ctx.userId);
  const b = await parseBody(req, contentBody);
  const row = await createContent(getDb(), a.ctx, { ...b, plannedOn: toDay(b.plannedOn) });
  return json(contentOut(a, row), 201, requestId);
}

export async function patchPlanning(a: Authorized, req: NextRequest, contentId: string, requestId: string) {
  const b = await parseBody(req, planningPatchBody);
  await updatePlanning(getDb(), a.ctx, uuid(contentId), b);
  return json({ ok: true }, 200, requestId);
}

export async function putMaterial(a: Authorized, req: NextRequest, contentId: string, requestId: string) {
  const { expectedVersionId, ...material } = await parseBody(req, materialBody);
  const r = await editMaterial(getDb(), a.ctx, uuid(contentId), material, expectedVersionId);
  return json(r, 200, requestId);
}

export async function postSend(a: Authorized, req: NextRequest, contentId: string, requestId: string) {
  const b = await parseBody(req, sendBody);
  return json(await sendVersion(getDb(), a.ctx, uuid(contentId), b.expectedVersionId), 200, requestId);
}

export async function postStatus(a: Authorized, req: NextRequest, contentId: string, requestId: string) {
  const b = await parseBody(req, statusBody);
  await transitionContent(getDb(), a.ctx, uuid(contentId), b.to, {
    cancelReason: b.cancelReason,
    publishedAt: b.publishedAt ? new Date(b.publishedAt) : undefined,
    publicationUrl: b.publicationUrl,
  });
  return json({ ok: true, status: b.to }, 200, requestId);
}

export async function putSchedule(a: Authorized, req: NextRequest, contentId: string, requestId: string) {
  const b = await parseBody(req, rescheduleBody);
  await rescheduleContent(getDb(), a.ctx, uuid(contentId), b.plannedOn);
  return json({ ok: true }, 200, requestId);
}

export async function putClassification(a: Authorized, req: NextRequest, contentId: string, requestId: string) {
  const b = await parseBody(req, classificationBody);
  await classifyContent(getDb(), a.ctx, uuid(contentId), b);
  return json({ ok: true }, 200, requestId);
}

export async function putVisibility(a: Authorized, req: NextRequest, contentId: string, requestId: string) {
  const b = await parseBody(req, visibilityBody);
  await shareContent(getDb(), a.ctx, uuid(contentId), b.visibility);
  return json({ ok: true }, 200, requestId);
}

export async function putCycle(a: Authorized, req: NextRequest, contentId: string, requestId: string) {
  const b = await parseBody(req, moveCycleBody);
  await moveContentToCycle(getDb(), a.ctx, uuid(contentId), b.cycleId, b.reason);
  return json({ ok: true }, 200, requestId);
}

export async function listCommentsResponse(a: Authorized, contentId: string, requestId: string) {
  const v = await getContentView(getDb(), a.ctx, uuid(contentId));
  return json({ items: v.comments.map((c) => commentRow(c)) }, 200, requestId);
}

export async function postComment(a: Authorized, req: NextRequest, contentId: string, requestId: string) {
  await limitMutation("comment", a.ctx.userId);
  const b = await parseBody(req, commentBody);
  const agency = isAgency(a.ctx);
  const r = await addComment(getDb(), a.ctx, {
    contentId: uuid(contentId),
    body: b.body,
    // Agencia escolhe (padrao interno: nunca vira compartilhado sem querer); cliente so cria compartilhado.
    visibility: b.visibility ?? (agency ? "INTERNO" : "COMPARTILHADO"),
    versionId: b.versionId,
  });
  return json(r, 201, requestId);
}

/** Decisao do cliente sobre UMA versao. Autor e horario vem da sessao e do banco, nunca do corpo. */
export async function postDecision(a: Authorized, req: NextRequest, contentId: string, versionId: string, requestId: string) {
  await limitMutation("decision", a.ctx.userId);
  const b = await parseBody(req, decisionBody);
  const r = await decideApproval(getDb(), a.ctx, { contentId: uuid(contentId), versionId: uuid(versionId), decision: b.decision, comment: b.comment });
  // `overRevisionLimit` e sinal para a agencia combinar com o cliente: nunca volta ao portal.
  return json({ approvalId: r.approvalId, replayed: r.replayed, decision: b.decision }, r.replayed ? 200 : 201, requestId);
}

export async function getCalendar(a: Authorized, req: NextRequest, requestId: string) {
  const q = parseQuery(req, calendarQuery);
  const items = await calendarFor(getDb(), a.ctx, q);
  return json({ year: q.year, month: q.month, items: items.map((i) => calendarItemOut.parse(i)) }, 200, requestId);
}
