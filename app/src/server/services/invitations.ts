import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { Prisma } from "@/generated/prisma/client";
import type { MemberRole } from "@/generated/prisma/enums";
import { systemContextForPublicTokenFlow, type TenantContext } from "@/server/authorization/context";
import { assertCan } from "@/server/authorization/permissions";
import type { Db } from "@/server/db/client";
import { withSystem, withTenant } from "@/server/db/scope";
import { ConflictError, InvalidInvitationError, WeakPasswordError } from "@/server/errors";
import { recordAudit } from "@/server/repositories/audit";
import { insertInvitation } from "@/server/repositories/invitations";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias (spec 0001)
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

/** Token de alta entropia (256 bits): SHA-256 basta como hash, sem sal. So o hash e gravado. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export interface CreatedInvitation {
  invitationId: string;
  /** Token em claro: devolvido UMA vez, para montar o link. Nunca e gravado nem logado. */
  token: string;
  expiresAt: Date;
}

export async function createInvitation(
  db: Db,
  ctx: TenantContext,
  input: { email: string; role: MemberRole },
  now: Date = new Date(),
): Promise<CreatedInvitation> {
  assertCan(ctx, "invitation:create");
  const email = normalizeEmail(input.email);
  // STAFF e atribuido a clientes pelo admin; este caminho convida so pessoas do cliente ou STAFF.
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

  try {
    return await withTenant(db, ctx, async (s) => {
      const existing = await s.tx.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) throw new ConflictError("EMAIL_TAKEN", "Ja existe uma conta com este e-mail.");
      const inv = await insertInvitation(s, { email, role: input.role, tokenHash: hashToken(token), expiresAt, createdAt: now });
      await recordAudit(s, {
        action: "invitation.created",
        entityType: "invitation",
        entityId: inv.id,
        diff: { email, role: input.role, expiresAt },
      });
      return { invitationId: inv.id, token, expiresAt };
    });
  } catch (error) {
    // Indice unico parcial: ja ha convite pendente para este e-mail neste cliente.
    if (isUniqueViolation(error)) throw new ConflictError("INVITATION_PENDING", "Ja existe convite pendente para este e-mail.");
    throw error;
  }
}

export interface AcceptInput {
  token: string;
  name: string;
  password: string;
}

/**
 * Aceita o convite: marca o uso de forma atomica (UPDATE ... WHERE used_at IS NULL AND
 * revoked_at IS NULL AND expires_at > agora), cria usuario, senha (hash scrypt do Better Auth)
 * e participacao na mesma transacao. Qualquer falha desfaz tudo, inclusive o uso do convite.
 * A resposta de erro e a mesma para token inexistente, usado, revogado ou expirado.
 */
export async function acceptInvitation(db: Db, input: AcceptInput, now: Date = new Date()): Promise<{ userId: string; clientId: string }> {
  if (input.password.length < MIN_PASSWORD_LENGTH || input.password.length > MAX_PASSWORD_LENGTH) {
    throw new WeakPasswordError(`A senha precisa ter de ${MIN_PASSWORD_LENGTH} a ${MAX_PASSWORD_LENGTH} caracteres.`);
  }
  const name = input.name.trim();
  if (!name) throw new WeakPasswordError("Informe o nome.");
  const tokenHash = hashToken(input.token);
  const passwordHash = await hashPassword(input.password); // fora da transacao: e custoso

  try {
    return await withSystem(db, systemContextForPublicTokenFlow(), async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { tokenHash, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) throw new InvalidInvitationError();

      const inv = await tx.invitation.findUniqueOrThrow({ where: { tokenHash } });
      const client = await tx.client.findUniqueOrThrow({ where: { id: inv.clientId }, select: { status: true } });
      if (client.status !== "ACTIVE") throw new InvalidInvitationError();

      const taken = await tx.user.findUnique({ where: { email: inv.email }, select: { id: true } });
      if (taken) throw new ConflictError("EMAIL_TAKEN", "Ja existe uma conta com este e-mail.");

      const user = await tx.user.create({
        data: {
          name,
          email: inv.email,
          emailVerified: true, // o convite foi enviado a este e-mail
          role: inv.role === "STAFF" ? "STAFF" : "USER",
        },
      });
      await tx.account.create({
        data: { userId: user.id, providerId: "credential", accountId: user.id, password: passwordHash },
      });
      await tx.clientMember.create({ data: { clientId: inv.clientId, userId: user.id, role: inv.role } });
      await tx.invitation.update({ where: { id: inv.id }, data: { usedByUserId: user.id } });
      await tx.auditLog.create({
        data: {
          clientId: inv.clientId,
          actorId: user.id,
          action: "invitation.accepted",
          entityType: "invitation",
          entityId: inv.id,
          diff: { role: inv.role },
        },
      });
      return { userId: user.id, clientId: inv.clientId };
    });
  } catch (error) {
    // Corrida entre dois aceites do mesmo e-mail: a restricao unica do banco decide.
    if (isUniqueViolation(error)) throw new ConflictError("EMAIL_TAKEN", "Ja existe uma conta com este e-mail.");
    throw error;
  }
}

export interface InvitationPreview {
  email: string;
  clientName: string;
  role: MemberRole;
  expiresAt: Date;
}

/**
 * Mostra a quem abriu o link para quem e o convite. Mesma resposta (null) para token inexistente,
 * usado, revogado ou expirado: nao revela qual caso. Nunca devolve o hash.
 */
export async function peekInvitation(db: Db, token: string, now: Date = new Date()): Promise<InvitationPreview | null> {
  if (token.length < 20 || token.length > 200) return null;
  return withSystem(db, systemContextForPublicTokenFlow(), async (tx) => {
    const inv = await tx.invitation.findFirst({
      where: { tokenHash: hashToken(token), usedAt: null, revokedAt: null, expiresAt: { gt: now }, client: { status: "ACTIVE" } },
      select: { email: true, role: true, expiresAt: true, client: { select: { name: true } } },
    });
    if (!inv) return null;
    return { email: inv.email, clientName: inv.client.name, role: inv.role, expiresAt: inv.expiresAt };
  });
}
