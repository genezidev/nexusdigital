import "server-only";
import type { GlobalRole } from "@/generated/prisma/enums";
import { getAuth } from "@/server/auth/instance";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";
import { assertAdmin, assertStaffArea, type Actor } from "@/server/services/access";

export interface SessionActor extends Actor {
  sessionToken: string;
  /** Cliente ativo gravado PELO SERVIDOR na sessao. So vira contexto apos resolveTenantContext. */
  activeClientId: string | null;
  themePreference: "SYSTEM" | "LIGHT" | "DARK";
}

/**
 * Le a sessao no banco (sem cookie cache): sessao revogada, expirada ou conta bloqueada = null
 * na requisicao seguinte. O papel vem do banco, nunca do navegador.
 */
export async function getActor(headers: Headers): Promise<SessionActor | null> {
  const result = await getAuth().api.getSession({ headers });
  if (!result) return null;
  const user = result.user as typeof result.user & {
    role?: string | null;
    banned?: boolean | null;
    banExpires?: Date | null;
    themePreference?: string | null;
  };
  const session = result.session as typeof result.session & { activeClientId?: string | null };
  if (user.banned && (!user.banExpires || new Date(user.banExpires).getTime() > Date.now())) return null;
  const role = (user.role ?? "USER") as GlobalRole;
  if (role !== "ADMIN" && role !== "STAFF" && role !== "USER") return null;
  const theme = user.themePreference === "LIGHT" || user.themePreference === "DARK" ? user.themePreference : "SYSTEM";
  return {
    userId: user.id,
    role,
    name: user.name,
    email: user.email,
    sessionToken: session.token,
    activeClientId: session.activeClientId ?? null,
    themePreference: theme,
  };
}

export async function requireActor(headers: Headers): Promise<SessionActor> {
  const actor = await getActor(headers);
  if (!actor) throw new UnauthorizedError();
  return actor;
}

/** ADMIN ou STAFF (area /admin). Quem e de cliente recebe 403. */
export async function requireStaffArea(headers: Headers): Promise<SessionActor> {
  const actor = await requireActor(headers);
  assertStaffArea(actor);
  return actor;
}

export async function requireAdmin(headers: Headers): Promise<SessionActor> {
  const actor = await requireActor(headers);
  assertAdmin(actor);
  return actor;
}

/** Pessoa de cliente (area /portal). ADMIN e STAFF nao tem "cliente ativo" e sao encaminhados ao /admin. */
export async function requireClientUser(headers: Headers): Promise<SessionActor> {
  const actor = await requireActor(headers);
  if (actor.role !== "USER") throw new ForbiddenError();
  return actor;
}
