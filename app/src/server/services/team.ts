import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { TenantContext } from "@/server/authorization/context";
import { assertCan } from "@/server/authorization/permissions";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/scope";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors";
import { recordAudit } from "@/server/repositories/audit";
import { hashToken, INVITATION_TTL_MS, normalizeEmail } from "@/server/services/invitations";

// D-0026, R-24: o DONO do cliente convida e administra a equipe (colaboradores) do PROPRIO cliente. O cliente vem sempre
// da sessao (ctx.clientId), nunca do navegador. O dono nunca cria, altera nem remove OWNER, ADMIN ou STAFF, nunca mexe em
// si mesmo e so concede `content:approve` (que ele tem). O banco impoe o mesmo (gatilhos `client_members_admin_only`
// e `invitations_admin_only`): este servico so devolve respostas claras antes de chegar la.

export const APPROVE_PERMISSION = "content:approve";
const permissionsFor = (approve: boolean): string[] => (approve ? [APPROVE_PERMISSION] : []);

const memberSelect = {
  id: true,
  userId: true,
  role: true,
  permissions: true,
  status: true,
  createdAt: true,
  user: { select: { name: true, email: true, lastLoginAt: true } },
} as const;

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "CLIENT_OWNER" | "CLIENT_COLLABORATOR";
  status: "ACTIVE" | "REVOKED";
  canApprove: boolean;
  isSelf: boolean;
  /** So colaborador pode ser gerenciado pelo dono (e nunca ele mesmo). */
  manageable: boolean;
  lastLoginAt: Date | null;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: string;
  canApprove: boolean;
  expiresAt: Date;
  /** So convite de colaborador pode ser revogado pelo dono. */
  revocable: boolean;
}

/** Equipe do cliente da sessao: pessoas do cliente (nunca a equipe da agencia) e convites pendentes. */
export async function loadTeam(db: Db, ctx: TenantContext, now: Date = new Date()): Promise<{ members: TeamMember[]; invitations: TeamInvitation[] }> {
  assertCan(ctx, "team:manage");
  return withTenant(db, ctx, async (s) => {
    const rows = await s.tx.clientMember.findMany({
      where: { clientId: ctx.clientId, role: { in: ["CLIENT_OWNER", "CLIENT_COLLABORATOR"] } },
      select: memberSelect,
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    });
    const invites = await s.tx.invitation.findMany({
      where: { clientId: ctx.clientId, usedAt: null, revokedAt: null, expiresAt: { gt: now }, role: { in: ["CLIENT_OWNER", "CLIENT_COLLABORATOR"] } },
      // token_hash nunca sai: a selecao nao o inclui.
      select: { id: true, email: true, role: true, permissions: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
    return {
      members: rows.map((m) => ({
        id: m.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role as TeamMember["role"],
        status: m.status,
        canApprove: m.role === "CLIENT_OWNER" || m.permissions.includes(APPROVE_PERMISSION),
        isSelf: m.userId === ctx.userId,
        manageable: m.role === "CLIENT_COLLABORATOR" && m.userId !== ctx.userId,
        lastLoginAt: m.user.lastLoginAt,
      })),
      invitations: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        canApprove: (i.permissions ?? []).includes(APPROVE_PERMISSION),
        expiresAt: i.expiresAt,
        revocable: i.role === "CLIENT_COLLABORATOR",
      })),
    };
  });
}

export interface CreatedTeamInvitation {
  invitationId: string;
  /** Token em claro: devolvido UMA vez, para o dono copiar o link. So o hash e gravado. */
  token: string;
  expiresAt: Date;
}

/** Convida um COLABORADOR. Pessoa que ja tem conta no sistema: 409 com mensagem clara (acesso a mais de um cliente fica com a agencia). */
export async function inviteCollaborator(db: Db, ctx: TenantContext, input: { email: string; approve: boolean }, now: Date = new Date()): Promise<CreatedTeamInvitation> {
  assertCan(ctx, "team:manage");
  const email = normalizeEmail(input.email);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  try {
    return await withTenant(db, ctx, async (s) => {
      const existing = await s.tx.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) {
        throw new ConflictError("EMAIL_TAKEN", "Essa pessoa ja tem uma conta no Nexo Digital. Fale com a agencia para liberar o acesso dela.");
      }
      const inv = await s.tx.invitation.create({
        // clientId e convidante vem SEMPRE do contexto da sessao; o papel e fixo.
        data: { clientId: ctx.clientId, invitedById: ctx.userId, email, role: "CLIENT_COLLABORATOR", permissions: permissionsFor(input.approve), tokenHash: hashToken(token), expiresAt, createdAt: now },
        select: { id: true },
      });
      await recordAudit(s, { action: "team.invited", entityType: "invitation", entityId: inv.id, diff: { email, role: "CLIENT_COLLABORATOR", canApprove: input.approve } });
      return { invitationId: inv.id, token, expiresAt };
    });
  } catch (error) {
    // Indice unico parcial: ja ha convite pendente para este e-mail neste cliente.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictError("INVITATION_PENDING", "Ja existe um convite pendente para este e-mail.");
    }
    throw error;
  }
}

/** Revoga um convite PENDENTE de colaborador do proprio cliente. Convite de outro papel ou cliente = 404. */
export async function revokeTeamInvitation(db: Db, ctx: TenantContext, invitationId: string, now: Date = new Date()) {
  assertCan(ctx, "team:manage");
  return withTenant(db, ctx, async (s) => {
    const { count } = await s.tx.invitation.updateMany({
      where: { id: invitationId, clientId: ctx.clientId, role: "CLIENT_COLLABORATOR", usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    if (count !== 1) throw new NotFoundError();
    await recordAudit(s, { action: "team.invitation_revoked", entityType: "invitation", entityId: invitationId });
  });
}

/** Localiza o membro dentro do cliente da sessao e garante que e um colaborador e nao e a propria pessoa. */
async function findManageable(s: { tx: Prisma.TransactionClient }, ctx: TenantContext, memberId: string) {
  const member = await s.tx.clientMember.findFirst({ where: { id: memberId, clientId: ctx.clientId }, select: { id: true, userId: true, role: true, permissions: true, status: true } });
  if (!member) throw new NotFoundError();
  if (member.userId === ctx.userId) throw new ConflictError("SELF_MANAGE", "Voce nao pode alterar o proprio acesso.");
  if (member.role !== "CLIENT_COLLABORATOR") throw new ForbiddenError("Voce so gerencia colaboradores da sua equipe.");
  return member;
}

/** Liga ou desliga a permissao de aprovar de um colaborador. Nenhuma outra permissao existe para conceder. */
export async function setCollaboratorApproval(db: Db, ctx: TenantContext, memberId: string, approve: boolean) {
  assertCan(ctx, "team:manage");
  return withTenant(db, ctx, async (s) => {
    const member = await findManageable(s, ctx, memberId);
    const { count } = await s.tx.clientMember.updateMany({ where: { id: member.id, clientId: ctx.clientId }, data: { permissions: permissionsFor(approve) } });
    if (count !== 1) throw new NotFoundError();
    await recordAudit(s, { action: "team.permissions_changed", entityType: "member", entityId: member.id, diff: { canApprove: approve } });
    return { canApprove: approve };
  });
}

/** Desativa (acesso revogado) ou reativa um colaborador deste cliente. A conta dele em outros clientes nao muda. */
export async function setCollaboratorActive(db: Db, ctx: TenantContext, memberId: string, active: boolean) {
  assertCan(ctx, "team:manage");
  return withTenant(db, ctx, async (s) => {
    const member = await findManageable(s, ctx, memberId);
    const { count } = await s.tx.clientMember.updateMany({ where: { id: member.id, clientId: ctx.clientId }, data: { status: active ? "ACTIVE" : "REVOKED" } });
    if (count !== 1) throw new NotFoundError();
    await recordAudit(s, { action: active ? "team.member_reactivated" : "team.member_deactivated", entityType: "member", entityId: member.id });
    return { active };
  });
}
