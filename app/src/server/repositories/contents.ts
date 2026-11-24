import type { Prisma } from "@/generated/prisma/client";
import type { Channel, ContentFormat, ContentStatus, Visibility } from "@/generated/prisma/enums";
import { assertCan, isAgency } from "@/server/authorization/permissions";
import type { Scoped } from "@/server/db/scope";

// Visibilidade NO repositorio (e, de novo, na RLS): o cliente so ve conteudo COMPARTILHADO e so versoes ENVIADAS.
// Campos expostos ao cliente por lista explicita (spec 0002, "Aprovacao e visibilidade"): nunca objetivo, pilar,
// notas internas, briefing, responsavel (so se a agencia marcar), classificacao de cota nem justificativa interna.

const contentClientSelect = {
  id: true,
  clientId: true,
  cycleId: true,
  title: true,
  description: true,
  format: true,
  channel: true,
  plannedOn: true,
  publishedAt: true,
  publicationUrl: true,
  status: true,
  visibility: true,
  currentVersionId: true,
  assignee: { select: { name: true } },
  assigneeVisibleToClient: true,
} as const satisfies Prisma.ContentSelect;

const versionClientSelect = {
  id: true,
  contentId: true,
  number: true,
  status: true,
  caption: true,
  cta: true,
  hashtags: true,
  sentAt: true,
} as const satisfies Prisma.ContentVersionSelect;

export type ContentClientView = Prisma.ContentGetPayload<{ select: typeof contentClientSelect }>;

function visibleWhere(s: Scoped): Prisma.ContentWhereInput {
  return isAgency(s.ctx) ? { clientId: s.ctx.clientId } : { clientId: s.ctx.clientId, visibility: "COMPARTILHADO" };
}

/** Resultado para o cliente nunca traz campos internos; o responsavel so aparece se a agencia marcou. */
function shapeForClient<T extends ContentClientView>(row: T) {
  const { assignee, assigneeVisibleToClient, ...rest } = row;
  return { ...rest, assigneeName: assigneeVisibleToClient ? (assignee?.name ?? null) : null };
}

export interface ContentFilter {
  cycleId?: string;
  status?: ContentStatus;
  plannedFrom?: Date;
  plannedTo?: Date;
}

export async function listContents(s: Scoped, filter: ContentFilter = {}) {
  assertCan(s.ctx, "content:read");
  const where: Prisma.ContentWhereInput = {
    ...visibleWhere(s),
    ...(filter.cycleId ? { cycleId: filter.cycleId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.plannedFrom || filter.plannedTo ? { plannedOn: { gte: filter.plannedFrom, lte: filter.plannedTo } } : {}),
  };
  const orderBy = [{ plannedOn: "asc" as const }, { id: "asc" as const }];
  if (isAgency(s.ctx)) return s.tx.content.findMany({ where, orderBy });
  return (await s.tx.content.findMany({ where, orderBy, select: contentClientSelect })).map(shapeForClient);
}

export interface ContentPageQuery extends ContentFilter {
  page: number;
  pageSize: number;
  format?: ContentFormat;
  visibility?: Visibility;
  q?: string;
  sort: "plannedOn" | "title" | "status" | "createdAt";
  dir: "asc" | "desc";
}

/** Listagem paginada, filtrada e ordenada NO SERVIDOR. Cliente: so compartilhados, so campos da lista explicita. */
export async function pageContents(s: Scoped, q: ContentPageQuery) {
  assertCan(s.ctx, "content:read");
  const agency = isAgency(s.ctx);
  const where: Prisma.ContentWhereInput = {
    ...visibleWhere(s),
    ...(q.cycleId ? { cycleId: q.cycleId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.format ? { format: q.format } : {}),
    ...(agency && q.visibility ? { visibility: q.visibility } : {}),
    ...(q.q ? { title: { contains: q.q, mode: "insensitive" as const } } : {}),
    ...(q.plannedFrom || q.plannedTo ? { plannedOn: { gte: q.plannedFrom, lte: q.plannedTo } } : {}),
  };
  const orderBy = [{ [q.sort]: q.dir } as Prisma.ContentOrderByWithRelationInput, { id: "asc" as const }];
  const page = { orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize };
  const total = await s.tx.content.count({ where });
  if (agency) return { items: await s.tx.content.findMany({ where, ...page }), total };
  return { items: (await s.tx.content.findMany({ where, ...page, select: contentClientSelect })).map(shapeForClient), total };
}

export async function getContent(s: Scoped, id: string) {
  assertCan(s.ctx, "content:read");
  if (isAgency(s.ctx)) return s.tx.content.findFirst({ where: { id, ...visibleWhere(s) } });
  const row = await s.tx.content.findFirst({ where: { id, ...visibleWhere(s) }, select: contentClientSelect });
  return row ? shapeForClient(row) : null;
}

export interface NewContent {
  cycleId: string;
  title: string;
  description?: string;
  format: ContentFormat;
  channel: Channel;
  objective?: string;
  pillar?: string;
  plannedOn: Date;
  assigneeId?: string;
  countsTowardQuota: boolean;
}

export async function insertContent(s: Scoped, data: NewContent) {
  assertCan(s.ctx, "content:write");
  return s.tx.content.create({ data: { ...data, clientId: s.ctx.clientId } });
}

/** Atualizacao so pela agencia; o filtro por cliente vale tambem aqui. Devolve quantas linhas mudaram. */
export async function updateContent(s: Scoped, id: string, data: Prisma.ContentUncheckedUpdateManyInput) {
  assertCan(s.ctx, "content:write");
  const { count } = await s.tx.content.updateMany({ where: { id, clientId: s.ctx.clientId }, data });
  return count;
}

/** Decisao do cliente: so o status muda (a RLS e o gatilho do banco recusam qualquer outra coisa). */
export async function setStatusAsClientDecision(s: Scoped, id: string, from: ContentStatus, to: ContentStatus) {
  assertCan(s.ctx, "content:approve");
  const { count } = await s.tx.content.updateMany({ where: { id, clientId: s.ctx.clientId, status: from }, data: { status: to } });
  return count;
}

export async function setClassification(s: Scoped, id: string, data: { countsTowardQuota?: boolean; isBonus?: boolean }) {
  assertCan(s.ctx, "content:classify");
  const { count } = await s.tx.content.updateMany({ where: { id, clientId: s.ctx.clientId }, data });
  return count;
}

export async function setVisibility(s: Scoped, id: string, visibility: Visibility) {
  assertCan(s.ctx, "content:write");
  const { count } = await s.tx.content.updateMany({ where: { id, clientId: s.ctx.clientId }, data: { visibility } });
  return count;
}

// ---------- Versoes ----------

export async function listVersions(s: Scoped, contentId: string) {
  assertCan(s.ctx, "content:read");
  const contentWhere = visibleWhere(s);
  if (isAgency(s.ctx)) {
    return s.tx.contentVersion.findMany({ where: { clientId: s.ctx.clientId, contentId, content: contentWhere }, orderBy: { number: "asc" } });
  }
  return s.tx.contentVersion.findMany({
    where: { clientId: s.ctx.clientId, contentId, status: "ENVIADA", content: contentWhere },
    orderBy: { number: "asc" },
    select: versionClientSelect,
  });
}

export async function getVersion(s: Scoped, versionId: string) {
  assertCan(s.ctx, "content:read");
  const where: Prisma.ContentVersionWhereInput = { id: versionId, clientId: s.ctx.clientId, content: visibleWhere(s) };
  if (isAgency(s.ctx)) return s.tx.contentVersion.findFirst({ where });
  return s.tx.contentVersion.findFirst({ where: { ...where, status: "ENVIADA" }, select: versionClientSelect });
}

export async function getDraftVersion(s: Scoped, contentId: string) {
  assertCan(s.ctx, "content:write");
  return s.tx.contentVersion.findFirst({ where: { clientId: s.ctx.clientId, contentId, status: "RASCUNHO" } });
}

export async function lastVersionNumber(s: Scoped, contentId: string): Promise<number> {
  assertCan(s.ctx, "content:write");
  const agg = await s.tx.contentVersion.aggregate({ where: { clientId: s.ctx.clientId, contentId }, _max: { number: true } });
  return agg._max.number ?? 0;
}

export interface VersionMaterial {
  caption?: string | null;
  cta?: string | null;
  hashtags?: string[];
  briefing?: string | null;
}

export async function insertVersion(s: Scoped, data: VersionMaterial & { contentId: string; number: number; status: "RASCUNHO" | "ENVIADA"; sentAt?: Date }) {
  assertCan(s.ctx, "content:write");
  return s.tx.contentVersion.create({ data: { ...data, clientId: s.ctx.clientId, authorId: s.ctx.userId } });
}

export async function updateDraftVersion(s: Scoped, id: string, data: VersionMaterial & { status?: "ENVIADA"; sentAt?: Date }) {
  assertCan(s.ctx, "content:write");
  const { count } = await s.tx.contentVersion.updateMany({ where: { id, clientId: s.ctx.clientId, status: "RASCUNHO" }, data });
  return count;
}

// ---------- Aprovacoes ----------

export async function listApprovals(s: Scoped, contentId: string) {
  assertCan(s.ctx, "content:read");
  return s.tx.approval.findMany({
    where: { clientId: s.ctx.clientId, contentId, content: visibleWhere(s) },
    select: {
      id: true,
      contentId: true,
      versionId: true,
      decision: true,
      comment: true,
      createdAt: true,
      invalidatedAt: true,
      invalidationReason: true,
      author: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function findActiveApproval(s: Scoped, versionId: string) {
  assertCan(s.ctx, "content:read");
  return s.tx.approval.findFirst({
    where: { clientId: s.ctx.clientId, versionId, invalidatedAt: null },
    include: { author: { select: { name: true } } },
  });
}

export async function insertApproval(s: Scoped, data: { contentId: string; versionId: string; decision: "APROVADO" | "REVISAO_SOLICITADA"; comment?: string }) {
  assertCan(s.ctx, "content:approve");
  // Autor vem da sessao e o horario, do banco (gatilho): nunca do corpo da requisicao.
  return s.tx.approval.create({ data: { ...data, clientId: s.ctx.clientId, authorId: s.ctx.userId } });
}

export async function countRevisionRequests(s: Scoped, contentId: string): Promise<number> {
  assertCan(s.ctx, "content:read");
  return s.tx.approval.count({ where: { clientId: s.ctx.clientId, contentId, decision: "REVISAO_SOLICITADA" } });
}

// ---------- Comentarios (imutaveis) ----------

export type CommentTarget = { contentId: string; scriptId?: undefined } | { scriptId: string; contentId?: undefined };

export async function listComments(s: Scoped, target: CommentTarget) {
  assertCan(s.ctx, "comment:read");
  const where: Prisma.CommentWhereInput = {
    clientId: s.ctx.clientId,
    ...(target.contentId ? { contentId: target.contentId } : { scriptId: target.scriptId }),
    ...(isAgency(s.ctx) ? {} : { visibility: "COMPARTILHADO" }),
  };
  return s.tx.comment.findMany({
    where,
    select: { id: true, contentId: true, scriptId: true, versionId: true, body: true, visibility: true, createdAt: true, author: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function insertComment(s: Scoped, data: CommentTarget & { versionId?: string; body: string; visibility: Visibility }) {
  assertCan(s.ctx, "comment:create");
  if (data.visibility === "INTERNO") assertCan(s.ctx, "comment:create_internal");
  return s.tx.comment.create({ data: { ...data, clientId: s.ctx.clientId, authorId: s.ctx.userId } });
}
