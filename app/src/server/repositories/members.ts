import type { MemberStatus } from "@/generated/prisma/enums";
import { assertCan } from "@/server/authorization/permissions";
import type { Scoped } from "@/server/db/scope";
import { NotFoundError } from "@/server/errors";

// Toda consulta leva client_id = cliente da sessao, inclusive a busca por id.
// Nunca seleciona dados de senha: o usuario e exposto so com id, nome e e-mail.
const memberSelect = {
  id: true,
  clientId: true,
  userId: true,
  role: true,
  permissions: true,
  status: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true, banned: true, lastLoginAt: true } },
} as const;

export async function listMembers(s: Scoped) {
  assertCan(s.ctx, "member:read");
  return s.tx.clientMember.findMany({
    where: { clientId: s.ctx.clientId },
    select: memberSelect,
    orderBy: { createdAt: "asc" },
  });
}

export async function getMemberById(s: Scoped, id: string) {
  assertCan(s.ctx, "member:read");
  return s.tx.clientMember.findFirst({ where: { id, clientId: s.ctx.clientId }, select: memberSelect });
}

export async function setMemberStatus(s: Scoped, id: string, status: MemberStatus) {
  assertCan(s.ctx, "member:manage");
  const { count } = await s.tx.clientMember.updateMany({ where: { id, clientId: s.ctx.clientId }, data: { status } });
  if (count === 0) throw new NotFoundError();
}

export async function removeMember(s: Scoped, id: string) {
  assertCan(s.ctx, "member:manage");
  const { count } = await s.tx.clientMember.deleteMany({ where: { id, clientId: s.ctx.clientId } });
  if (count === 0) throw new NotFoundError();
}
