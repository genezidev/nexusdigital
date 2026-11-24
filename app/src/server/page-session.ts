import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { GlobalRole } from "@/generated/prisma/enums";
import { getDb } from "@/server/db/client";
import { getActor, type SessionActor } from "@/server/http/actor";
import { listMyClientsForActor } from "@/server/services/clients";
import { assertAdmin, assertStaffArea } from "@/server/services/access";

// Sessao para PAGINAS (Server Components). `cache` deduplica a leitura dentro da MESMA requisicao
// (layout e pagina compartilham o resultado); nao ha cache entre requisicoes nem entre pessoas.
// A decisao de acesso e repetida em cada pagina: o layout nunca e a unica barreira.

export const getPageActor = cache(async (): Promise<SessionActor | null> => getActor(await headers()));

export const getMyClients = cache(async (userId: string) => listMyClientsForActor(getDb(), userId));

export function homeFor(role: GlobalRole): string {
  return role === "USER" ? "/portal" : "/admin";
}

export async function requirePageActor(): Promise<SessionActor> {
  const actor = await getPageActor();
  if (!actor) redirect("/login");
  return actor;
}

/** Area /admin: ADMIN ou STAFF. Pessoa de cliente recebe ForbiddenError (a pagina mostra "Acesso negado"). */
export async function requireStaffPageActor(): Promise<SessionActor> {
  const actor = await requirePageActor();
  assertStaffArea(actor);
  return actor;
}

export async function requireAdminPageActor(): Promise<SessionActor> {
  const actor = await requirePageActor();
  assertAdmin(actor);
  return actor;
}

/** Area /portal: pessoa de cliente. ADMIN e STAFF vao para /admin. */
export async function requireClientPageActor(): Promise<SessionActor> {
  const actor = await requirePageActor();
  if (actor.role !== "USER") redirect("/admin");
  return actor;
}
