import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { systemContextForAdmin, systemContextForSession, type TenantContext } from "@/server/authorization/context";
import { can } from "@/server/authorization/permissions";
import type { Db } from "@/server/db/client";
import { withSystemScoped, withTenant } from "@/server/db/scope";
import { ConflictError, NotFoundError } from "@/server/errors";
import { sanitizeDiff, listAudit, listAuditPage } from "@/server/repositories/audit";
import {
  createClient,
  getClientById,
  listAssignedClientsPage,
  listClientsPage,
  listMyClients,
  type PageQuery,
} from "@/server/repositories/clients";
import { listInvitations } from "@/server/repositories/invitations";
import { listMembers } from "@/server/repositories/members";
import { assertAdmin, resolveAdminClientContext, type Actor } from "@/server/services/access";

export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "cliente";
}

export interface NewClientInput {
  name: string;
  contactName?: string;
  contactEmail?: string;
  timezone: string;
}

/** Cria o cliente (so ADMIN) e registra na auditoria na mesma transacao. */
export async function createClientAsAdmin(db: Db, actor: Actor, input: NewClientInput) {
  assertAdmin(actor);
  const sys = await systemContextForAdmin(db, actor.userId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = `${slugify(input.name)}-${randomBytes(3).toString("hex")}`;
    try {
      return await withSystemScoped(db, sys, async (s) => {
        const client = await createClient(s, {
          name: input.name,
          slug,
          contactName: input.contactName,
          contactEmail: input.contactEmail?.toLowerCase(),
          timezone: input.timezone,
        });
        await s.tx.auditLog.create({
          data: {
            clientId: client.id,
            actorId: actor.userId,
            action: "client.created",
            entityType: "client",
            entityId: client.id,
            diff: sanitizeDiff({ name: client.name, timezone: client.timezone, contactEmail: client.contactEmail }),
          },
        });
        return { id: client.id, name: client.name, slug: client.slug, timezone: client.timezone };
      });
    } catch (error) {
      // Colisao do sufixo aleatorio do slug (raro): tenta de novo com outro sufixo.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new ConflictError("SLUG_TAKEN", "Nao foi possivel gerar um identificador unico. Tente novamente.");
}

/** Lista clientes que a pessoa pode ver: ADMIN todos; STAFF so os atribuidos. Outros papeis: nenhum acesso. */
export async function listClientsForActor(db: Db, actor: Actor, query: PageQuery) {
  if (actor.role === "ADMIN") {
    const sys = await systemContextForAdmin(db, actor.userId);
    return withSystemScoped(db, sys, (s) => listClientsPage(s, query));
  }
  if (actor.role === "STAFF") {
    const sys = systemContextForSession(actor.userId);
    return withSystemScoped(db, sys, (s) => listAssignedClientsPage(s, actor.userId, query));
  }
  throw new NotFoundError();
}

export async function getClientDetail(db: Db, actor: Actor, clientId: string) {
  const ctx = await resolveAdminClientContext(db, actor, clientId);
  return loadClientDetail(db, ctx);
}

export async function loadClientDetail(db: Db, ctx: TenantContext) {
  return withTenant(db, ctx, async (s) => {
    const client = await getClientById(s, ctx.clientId);
    if (!client) throw new NotFoundError();
    const [members, invitations, audit] = await Promise.all([
      can(ctx, "member:read") ? listMembers(s) : [],
      can(ctx, "invitation:read") ? listInvitations(s) : [],
      can(ctx, "audit:read") ? listAudit(s, 15) : [],
    ]);
    return {
      client,
      members: members.filter((m) => m.role !== "STAFF"),
      staff: members.filter((m) => m.role === "STAFF"),
      invitations,
      audit,
      permissions: {
        canInvite: can(ctx, "invitation:create"),
        canManageMembers: can(ctx, "member:manage"),
        canRevokeInvitation: can(ctx, "invitation:revoke"),
      },
    };
  });
}

export async function getAdminOverview(db: Db, actor: Actor) {
  if (actor.role === "ADMIN") {
    const sys = await systemContextForAdmin(db, actor.userId);
    return withSystemScoped(db, sys, async (s) => {
      const now = new Date();
      const [clientsTotal, clientsActive, pendingInvitations, blockedAccounts, recent] = await Promise.all([
        s.tx.client.count(),
        s.tx.client.count({ where: { status: "ACTIVE" } }),
        s.tx.invitation.count({ where: { usedAt: null, revokedAt: null, expiresAt: { gt: now } } }),
        s.tx.user.count({ where: { banned: true, role: { not: "ADMIN" } } }),
        listAuditPage(s, { page: 1, pageSize: 5 }),
      ]);
      return { kind: "ADMIN" as const, clientsTotal, clientsActive, pendingInvitations, blockedAccounts, recent: recent.items };
    });
  }
  const page = await listClientsForActor(db, actor, { page: 1, pageSize: 5 });
  return { kind: "STAFF" as const, clientsTotal: page.total, clients: page.items };
}

export async function listMyClientsForActor(db: Db, userId: string) {
  return withSystemScoped(db, systemContextForSession(userId), (s) => listMyClients(s, userId));
}

export async function getAuditPageForAdmin(db: Db, actor: Actor, query: { page: number; pageSize: number }) {
  assertAdmin(actor);
  const sys = await systemContextForAdmin(db, actor.userId);
  return withSystemScoped(db, sys, (s) => listAuditPage(s, query));
}
