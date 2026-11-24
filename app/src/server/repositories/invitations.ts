import type { MemberRole } from "@/generated/prisma/enums";
import { assertCan } from "@/server/authorization/permissions";
import type { Scoped } from "@/server/db/scope";
import { NotFoundError } from "@/server/errors";

// token_hash nunca sai do repositorio: a selecao abaixo nao o inclui.
const invitationSelect = {
  id: true,
  clientId: true,
  email: true,
  role: true,
  expiresAt: true,
  usedAt: true,
  revokedAt: true,
  invitedById: true,
  createdAt: true,
} as const;

export async function listInvitations(s: Scoped) {
  assertCan(s.ctx, "invitation:read");
  return s.tx.invitation.findMany({
    where: { clientId: s.ctx.clientId },
    select: invitationSelect,
    orderBy: { createdAt: "desc" },
  });
}

export async function getInvitationById(s: Scoped, id: string) {
  assertCan(s.ctx, "invitation:read");
  return s.tx.invitation.findFirst({ where: { id, clientId: s.ctx.clientId }, select: invitationSelect });
}

export async function insertInvitation(
  s: Scoped,
  data: { email: string; role: MemberRole; tokenHash: string; expiresAt: Date; createdAt: Date },
) {
  assertCan(s.ctx, "invitation:create");
  return s.tx.invitation.create({
    // clientId e invitedById vem sempre do contexto da sessao, nunca do chamador.
    data: { ...data, clientId: s.ctx.clientId, invitedById: s.ctx.userId },
    select: invitationSelect,
  });
}

// Revogar = tornar inutilizavel. So convites pendentes do proprio cliente.
export async function revokeInvitation(s: Scoped, id: string, now: Date) {
  assertCan(s.ctx, "invitation:revoke");
  const { count } = await s.tx.invitation.updateMany({
    where: { id, clientId: s.ctx.clientId, usedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
  if (count === 0) throw new NotFoundError();
}
