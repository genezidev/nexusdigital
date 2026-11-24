import type { TenantContext } from "@/server/authorization/context";
import { assertCan } from "@/server/authorization/permissions";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/scope";
import { ConflictError, NotFoundError } from "@/server/errors";
import { recordAudit } from "@/server/repositories/audit";
import { revokeInvitation } from "@/server/repositories/invitations";
import { getMemberById } from "@/server/repositories/members";

// Acoes de administracao sobre pessoas de um cliente. O membro e sempre procurado dentro do cliente
// da sessao (getMemberById filtra por clientId): id de membro de outro cliente vira 404.

/** Bloqueia ou desbloqueia a CONTA (vale para todos os clientes da pessoa). Bloquear derruba as sessoes. */
export async function setMemberAccountBlocked(db: Db, ctx: TenantContext, memberId: string, blocked: boolean) {
  assertCan(ctx, "member:manage");
  return withTenant(db, ctx, async (s) => {
    const member = await getMemberById(s, memberId);
    if (!member) throw new NotFoundError();
    if (member.userId === ctx.userId) throw new ConflictError("SELF_BLOCK", "Voce nao pode bloquear a propria conta.");
    await s.tx.user.update({
      where: { id: member.userId },
      data: { banned: blocked, banReason: blocked ? "Bloqueado pelo administrador" : null, banExpires: null },
    });
    let revoked = 0;
    if (blocked) revoked = (await s.tx.session.deleteMany({ where: { userId: member.userId } })).count;
    await recordAudit(s, {
      action: blocked ? "member.blocked" : "member.unblocked",
      entityType: "member",
      entityId: member.id,
      diff: { userId: member.userId, sessionsRevoked: revoked },
    });
    return { blocked, sessionsRevoked: revoked };
  });
}

/** Encerra todas as sessoes da pessoa: ela precisa entrar de novo na proxima requisicao. */
export async function revokeMemberSessions(db: Db, ctx: TenantContext, memberId: string) {
  assertCan(ctx, "member:manage");
  return withTenant(db, ctx, async (s) => {
    const member = await getMemberById(s, memberId);
    if (!member) throw new NotFoundError();
    const { count } = await s.tx.session.deleteMany({ where: { userId: member.userId } });
    await recordAudit(s, {
      action: "member.sessions_revoked",
      entityType: "member",
      entityId: member.id,
      diff: { userId: member.userId, sessionsRevoked: count },
    });
    return { sessionsRevoked: count };
  });
}

export async function revokePendingInvitation(db: Db, ctx: TenantContext, invitationId: string, now: Date = new Date()) {
  assertCan(ctx, "invitation:revoke");
  return withTenant(db, ctx, async (s) => {
    await revokeInvitation(s, invitationId, now);
    await recordAudit(s, { action: "invitation.revoked", entityType: "invitation", entityId: invitationId });
  });
}
