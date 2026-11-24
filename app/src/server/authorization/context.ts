import type { GlobalRole, MemberRole } from "@/generated/prisma/enums";
import type { Db } from "@/server/db/client";
import { withSystem } from "@/server/db/scope";
export { audienceOf, type Audience } from "@/server/authorization/audience";
import { ForbiddenError } from "@/server/errors";

declare const tenantBrand: unique symbol;
declare const systemBrand: unique symbol;

/**
 * Prova de que o servidor resolveu o cliente a partir da SESSAO e conferiu a participacao.
 * So `resolveTenantContext` cria este objeto; repositorios nao aceitam um clientId solto.
 */
export interface TenantContext {
  readonly [tenantBrand]: true;
  readonly clientId: string;
  readonly userId: string;
  readonly globalRole: GlobalRole;
  /** null para ADMIN, que nao e membro: acessa qualquer cliente ativo. */
  readonly memberRole: MemberRole | null;
  /** client_members.permissions da participacao (vazio para ADMIN): concessoes e revogacoes finas. */
  readonly permissions: readonly string[];
}

/** Escopo sem cliente (operacoes de ADMIN entre clientes e fluxos publicos por token). */
export interface SystemContext {
  readonly [systemBrand]: true;
  readonly reason: "admin" | "staff-area" | "public-token-flow" | "session-resolution" | "seed" | "maintenance";
  readonly userId: string | null;
}

/** O que sai da sessao validada pelo Better Auth. O clientId vem da sessao, nunca do navegador. */
export interface SessionClaims {
  userId: string;
  activeClientId: string | null;
}

type UserGate = { role: GlobalRole; banned: boolean; banExpires: Date | null };

function isBanned(user: Pick<UserGate, "banned" | "banExpires">): boolean {
  if (!user.banned) return false;
  return !user.banExpires || user.banExpires.getTime() > Date.now();
}

function makeTenant(
  clientId: string,
  userId: string,
  globalRole: GlobalRole,
  memberRole: MemberRole | null,
  permissions: readonly string[] = [],
): TenantContext {
  return { clientId, userId, globalRole, memberRole, permissions } as TenantContext;
}

function systemContext(reason: SystemContext["reason"], userId: string | null): SystemContext {
  return { reason, userId } as SystemContext;
}

/**
 * Valida, no banco e a cada requisicao, que o usuario da sessao pode agir no cliente ativo.
 * Conta bloqueada, STAFF desatribuido e membro revogado perdem o acesso na requisicao seguinte.
 */
export async function resolveTenantContext(
  db: Db,
  session: SessionClaims,
  options: { allowInactiveClientForAdmin?: boolean } = {},
): Promise<TenantContext> {
  if (!session.activeClientId) throw new ForbiddenError("Nenhum cliente ativo na sessao.");
  const clientId = session.activeClientId;
  const sys = systemContext("session-resolution", session.userId);

  const { user, client, member } = await withSystem(db, sys, async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: session.userId },
      select: { id: true, role: true, banned: true, banExpires: true },
    });
    const client = await tx.client.findUnique({ where: { id: clientId }, select: { status: true } });
    const member = await tx.clientMember.findUnique({
      where: { clientId_userId: { clientId, userId: session.userId } },
      select: { role: true, status: true, permissions: true },
    });
    return { user, client, member };
  });

  if (!user || isBanned(user)) throw new ForbiddenError();
  if (!client) throw new ForbiddenError();
  // Cliente suspenso ou arquivado so e visivel ao ADMIN, e so quando a tela de administracao pede.
  const clientUsable = client.status === "ACTIVE" || (user.role === "ADMIN" && options.allowInactiveClientForAdmin === true);
  if (!clientUsable) throw new ForbiddenError();

  if (user.role === "ADMIN") return makeTenant(clientId, user.id, user.role, null);
  if (!member || member.status !== "ACTIVE") throw new ForbiddenError();
  // STAFF so entra por atribuicao (linha STAFF); papeis de cliente so para usuarios comuns.
  if (user.role === "STAFF" && member.role !== "STAFF") throw new ForbiddenError();
  if (user.role === "USER" && member.role === "STAFF") throw new ForbiddenError();
  return makeTenant(clientId, user.id, user.role, member.role, member.permissions);
}

/**
 * Troca o cliente ativo da sessao. Confere a participacao no servidor e so entao grava
 * sessions.active_client_id. O cliente pedido pelo navegador e apenas uma solicitacao.
 */
export async function switchActiveClient(db: Db, input: { sessionToken: string; userId: string; requestedClientId: string }): Promise<void> {
  await resolveTenantContext(db, { userId: input.userId, activeClientId: input.requestedClientId });
  const sys = systemContext("session-resolution", input.userId);
  const { count } = await withSystem(db, sys, (tx) =>
    tx.session.updateMany({
      where: { token: input.sessionToken, userId: input.userId },
      data: { activeClientId: input.requestedClientId },
    }),
  );
  if (count !== 1) throw new ForbiddenError();
}

/** Escopo de sistema para operacoes entre clientes: so para ADMIN ativo e nao bloqueado. */
export async function systemContextForAdmin(db: Db, userId: string): Promise<SystemContext> {
  const sys = systemContext("session-resolution", userId);
  const user = await withSystem(db, sys, (tx) =>
    tx.user.findUnique({ where: { id: userId }, select: { role: true, banned: true, banExpires: true } }),
  );
  if (!user || user.role !== "ADMIN" || isBanned(user)) throw new ForbiddenError();
  return systemContext("admin", userId);
}

/**
 * Escopo de sistema para o catalogo da agencia (planos, sem cliente): ADMIN ou STAFF ativo e nao bloqueado.
 * STAFF so le (a escrita do catalogo exige o escopo `admin`, e a RLS de service_plans recusa o resto).
 */
export async function systemContextForStaffArea(db: Db, userId: string): Promise<SystemContext> {
  const sys = systemContext("session-resolution", userId);
  const user = await withSystem(db, sys, (tx) =>
    tx.user.findUnique({ where: { id: userId }, select: { role: true, banned: true, banExpires: true } }),
  );
  if (!user || (user.role !== "ADMIN" && user.role !== "STAFF") || isBanned(user)) throw new ForbiddenError();
  return systemContext("staff-area", userId);
}

/**
 * Escopo de sistema ligado a UMA pessoa ja autenticada (sessao, listar os proprios clientes, preferencias).
 * Quem usa deve filtrar sempre por este userId; nunca devolve dado de outra pessoa.
 */
export function systemContextForSession(userId: string): SystemContext {
  return systemContext("session-resolution", userId);
}

/**
 * Escopo de sistema para fluxos publicos autenticados por token (aceitar convite).
 * Uso restrito a services que validam o hash do token; nunca exponha a um handler generico.
 */
export function systemContextForPublicTokenFlow(): SystemContext {
  return systemContext("public-token-flow", null);
}

/** Uso exclusivo do seed e de testes, que rodam fora de uma sessao. */
export function systemContextForSeed(): SystemContext {
  return systemContext("seed", null);
}

/** Uso exclusivo de tarefas de manutencao (limpeza de arquivos pendentes e orfaos): sem pessoa, sem handler. */
export function systemContextForMaintenance(): SystemContext {
  return systemContext("maintenance", null);
}
