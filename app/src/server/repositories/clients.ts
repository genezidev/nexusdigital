import type { Prisma } from "@/generated/prisma/client";
import type { ClientStatus } from "@/generated/prisma/enums";
import { assertCan } from "@/server/authorization/permissions";
import type { Scoped, SystemScoped } from "@/server/db/scope";
import { ForbiddenError, NotFoundError } from "@/server/errors";

// Repositorio de clientes. No escopo de cliente, a "empresa" e o proprio registro: o filtro
// por cliente da sessao vale tambem para busca por id (where id = ? AND id = cliente da sessao).

export interface ClientPatch {
  name?: string;
  legalName?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  timezone?: string;
  status?: ClientStatus;
}

export async function getClientById(s: Scoped, id: string) {
  assertCan(s.ctx, "client:read");
  return s.tx.client.findFirst({ where: { id, AND: [{ id: s.ctx.clientId }] } });
}

export async function listClients(s: Scoped) {
  assertCan(s.ctx, "client:read");
  return s.tx.client.findMany({ where: { id: s.ctx.clientId } });
}

export async function updateClient(s: Scoped, id: string, patch: ClientPatch) {
  assertCan(s.ctx, "client:update");
  const { count } = await s.tx.client.updateMany({ where: { id, AND: [{ id: s.ctx.clientId }] }, data: patch });
  if (count === 0) throw new NotFoundError();
  return s.tx.client.findFirstOrThrow({ where: { id, AND: [{ id: s.ctx.clientId }] } });
}

// Cliente nunca e apagado pelo app (sem DELETE no GRANT): arquiva.
export async function archiveClient(s: Scoped, id: string) {
  return updateClient(s, id, { status: "ARCHIVED" });
}

// ---- Entre clientes: so ADMIN (escopo de sistema criado por systemContextForAdmin) ----

function assertAdminSystem(s: SystemScoped) {
  if (s.sys.reason !== "admin") throw new ForbiddenError();
}

export async function listAllClients(s: SystemScoped) {
  assertAdminSystem(s);
  return s.tx.client.findMany({ orderBy: { name: "asc" } });
}

export async function createClient(
  s: SystemScoped,
  data: { name: string; slug: string; legalName?: string; contactName?: string; contactEmail?: string; timezone?: string },
) {
  assertAdminSystem(s);
  return s.tx.client.create({ data });
}

// ---- Listagens paginadas (busca e paginacao no servidor) ----

export interface PageQuery {
  q?: string;
  page: number;
  pageSize: number;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

const clientListSelect = {
  id: true,
  name: true,
  slug: true,
  contactName: true,
  contactEmail: true,
  timezone: true,
  status: true,
  createdAt: true,
  _count: { select: { members: { where: { role: { not: "STAFF" }, status: "ACTIVE" } } } },
} as const;

function searchWhere(q: string | undefined) {
  const term = q?.trim();
  if (!term) return {};
  return {
    OR: [
      { name: { contains: term, mode: "insensitive" as const } },
      { contactEmail: { contains: term, mode: "insensitive" as const } },
      { slug: { contains: term, mode: "insensitive" as const } },
    ],
  };
}

function clampPage(query: PageQuery) {
  const pageSize = Math.min(Math.max(Math.trunc(query.pageSize) || 10, 1), 100);
  const page = Math.max(Math.trunc(query.page) || 1, 1);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

/** ADMIN: todos os clientes (escopo de sistema criado por systemContextForAdmin). */
export async function listClientsPage(s: SystemScoped, query: PageQuery): Promise<PageResult<ClientListRow>> {
  assertAdminSystem(s);
  const { page, pageSize, skip } = clampPage(query);
  const where = searchWhere(query.q);
  const [items, total] = await Promise.all([
    s.tx.client.findMany({ where, select: clientListSelect, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take: pageSize }),
    s.tx.client.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

/** STAFF: somente clientes ativos aos quais a pessoa esta atribuida (participacao STAFF ativa). */
export async function listAssignedClientsPage(s: SystemScoped, userId: string, query: PageQuery): Promise<PageResult<ClientListRow>> {
  if (s.sys.reason !== "session-resolution" || s.sys.userId !== userId) throw new ForbiddenError();
  const { page, pageSize, skip } = clampPage(query);
  const where = {
    AND: [
      { status: "ACTIVE" as const, members: { some: { userId, role: "STAFF" as const, status: "ACTIVE" as const } } },
      searchWhere(query.q),
    ],
  };
  const [items, total] = await Promise.all([
    s.tx.client.findMany({ where, select: clientListSelect, orderBy: [{ name: "asc" }, { id: "asc" }], skip, take: pageSize }),
    s.tx.client.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export type ClientListRow = Prisma.ClientGetPayload<{ select: typeof clientListSelect }>;

/** Clientes ativos em que a pessoa participa (portal): sempre filtrado pelo userId da sessao. */
export async function listMyClients(s: SystemScoped, userId: string) {
  if (s.sys.reason !== "session-resolution" || s.sys.userId !== userId) throw new ForbiddenError();
  const rows = await s.tx.clientMember.findMany({
    where: { userId, status: "ACTIVE", client: { status: "ACTIVE" } },
    select: { role: true, client: { select: { id: true, name: true } } },
    orderBy: { client: { name: "asc" } },
  });
  return rows.map((r) => ({ id: r.client.id, name: r.client.name, role: r.role }));
}
