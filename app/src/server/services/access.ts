import type { GlobalRole } from "@/generated/prisma/enums";
import { resolveTenantContext, type TenantContext } from "@/server/authorization/context";
import type { Db } from "@/server/db/client";
import { ForbiddenError, NotFoundError } from "@/server/errors";

/** Pessoa autenticada, ja validada contra o banco na requisicao (papel e bloqueio frescos). */
export interface Actor {
  userId: string;
  role: GlobalRole;
  name: string;
  email: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

export function assertStaffArea(actor: Actor): void {
  if (actor.role !== "ADMIN" && actor.role !== "STAFF") throw new ForbiddenError();
}

export function assertAdmin(actor: Actor): void {
  if (actor.role !== "ADMIN") throw new ForbiddenError();
}

/**
 * Cliente alvo de uma tela/acao de administracao (a URL e so um ALVO, nunca a fonte da verdade).
 * Quem decide e resolveTenantContext, que confere no banco: ADMIN ativo, ou STAFF com atribuicao
 * ativa. Id malformado, inexistente ou nao atribuido ao STAFF viram o MESMO 404 (nao revela existencia).
 * Usuario de cliente (USER) nunca entra na area de administracao: 403.
 */
export async function resolveAdminClientContext(db: Db, actor: Actor, clientId: string): Promise<TenantContext> {
  assertStaffArea(actor);
  if (!isUuid(clientId)) throw new NotFoundError();
  try {
    return await resolveTenantContext(db, { userId: actor.userId, activeClientId: clientId }, { allowInactiveClientForAdmin: true });
  } catch (error) {
    if (error instanceof ForbiddenError) throw new NotFoundError();
    throw error;
  }
}
