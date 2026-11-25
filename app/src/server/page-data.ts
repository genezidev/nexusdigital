import "server-only";
import { z } from "zod";
import { resolveTenantContext, type TenantContext } from "@/server/authorization/context";
import { can, isAgency } from "@/server/authorization/permissions";
import { getServerEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { withTenant } from "@/server/db/scope";
import { NotFoundError } from "@/server/errors";
import { cyclePortalOut, cycleAgencyOut, progressAgencyOut, progressPortalOut, subscriptionAgencyOut } from "@/server/http/dto-fase2";
import { getClientById } from "@/server/repositories/clients";
import { getMyClients, requireClientPageActor, requireStaffPageActor } from "@/server/page-session";
import { getCycleProgress } from "@/server/services/planning";
import { isUuid, resolveAdminClientContext } from "@/server/services/access";
import { listClientsForActor, loadClientDetail } from "@/server/services/clients";
import { pageCyclesFor, pageSubscriptionsFor } from "@/server/services/queries";

// Escopo das telas da fase 2. DUAS portas, como nas rotas de API:
//  - agencia (/admin/...): o cliente-alvo vem de `?client=<id>`, que e so um ALVO. Quem decide e
//    resolveAdminClientContext (ADMIN, ou STAFF atribuido; id invalido, inexistente ou nao atribuido = 404 uniforme);
//  - cliente (/portal/...): o cliente vem SEMPRE da sessao (resolveTenantContext). Nenhum parametro escolhe cliente.
// Nada daqui e guardado em cache compartilhado: sao dados por pessoa, lidos a cada requisicao.

export type SearchParams = Record<string, string | string[] | undefined>;

export const one = (params: SearchParams, key: string): string | undefined => {
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
};

export interface ClientOption {
  id: string;
  name: string;
}

export interface AdminScope {
  actor: Awaited<ReturnType<typeof requireStaffPageActor>>;
  isAdmin: boolean;
  clients: ClientOption[];
  /** null = nenhum cliente escolhido ainda (a tela mostra o seletor). */
  selected: { ctx: TenantContext; id: string; name: string; timezone: string } | null;
}

/** Cliente-alvo das telas de agencia. Sem `?client=` devolve `selected: null`; com id que a pessoa nao alcanca, 404. */
export async function loadAdminScope(params: SearchParams): Promise<AdminScope> {
  const actor = await requireStaffPageActor();
  const db = getDb();
  const list = await listClientsForActor(db, actor, { page: 1, pageSize: 50 });
  const clients = list.items.map((c) => ({ id: c.id, name: c.name }));
  const target = one(params, "client");
  if (!target) return { actor, isAdmin: actor.role === "ADMIN", clients, selected: null };
  if (!isUuid(target)) throw new NotFoundError();
  const ctx = await resolveAdminClientContext(db, actor, target);
  const client = await withTenant(db, ctx, (s) => getClientById(s, ctx.clientId));
  if (!client) throw new NotFoundError();
  const known = clients.some((c) => c.id === client.id);
  return {
    actor,
    isAdmin: actor.role === "ADMIN",
    clients: known ? clients : [{ id: client.id, name: client.name }, ...clients],
    selected: { ctx, id: client.id, name: client.name, timezone: client.timezone },
  };
}

export interface PortalScope {
  actor: Awaited<ReturnType<typeof requireClientPageActor>>;
  /** null = a pessoa nao tem cliente ativo (a tela explica e nao mostra dado nenhum). */
  active: { ctx: TenantContext; id: string; name: string; timezone: string; canApprove: boolean; canComment: boolean; canSubmitRecording: boolean } | null;
}

export async function loadPortalScope(): Promise<PortalScope> {
  const actor = await requireClientPageActor();
  const clients = await getMyClients(actor.userId);
  const active = clients.find((c) => c.id === actor.activeClientId) ?? null;
  if (!active) return { actor, active: null };
  const db = getDb();
  const ctx = await resolveTenantContext(db, { userId: actor.userId, activeClientId: actor.activeClientId });
  const client = await withTenant(db, ctx, (s) => getClientById(s, ctx.clientId));
  if (!client) return { actor, active: null };
  return {
    actor,
    active: {
      ctx,
      id: client.id,
      name: client.name,
      timezone: client.timezone,
      // Botoes so existem para quem tem a permissao; o servidor decide de novo em cada chamada.
      canApprove: can(ctx, "content:approve"),
      canComment: can(ctx, "comment:create"),
      canSubmitRecording: can(ctx, "recording:submit"),
    },
  };
}

/** Equipe da agencia que pode ser responsavel pelas pecas deste cliente (ADMIN e STAFF atribuido). */
export async function loadAssignees(ctx: TenantContext): Promise<{ id: string; name: string }[]> {
  if (!isAgency(ctx) || !can(ctx, "member:read")) return [];
  const detail = await loadClientDetail(getDb(), ctx);
  return detail.staff.filter((m) => m.status === "ACTIVE").map((m) => ({ id: m.userId, name: m.user.name }));
}

/** Ciclos e assinaturas do cliente (agencia), com progresso de cada ciclo. */
export async function loadPlanning(ctx: TenantContext) {
  const db = getDb();
  const subs = await pageSubscriptionsFor(db, ctx, { page: 1, pageSize: 50, dir: "desc" });
  const cycles = await pageCyclesFor(db, ctx, { page: 1, pageSize: 24, dir: "desc" });
  const progress = await Promise.all(cycles.items.map(async (c) => [c.id, progressAgencyOut.parse(await getCycleProgress(db, ctx, c.id))] as const));
  return {
    subscriptions: subs.items.map((s) => subscriptionAgencyOut.parse(s)),
    cycles: cycles.items.map((c) => cycleAgencyOut.parse(c)),
    progress: Object.fromEntries(progress),
  };
}

/** Ciclos abertos do cliente (para criar e mover pecas). */
export async function loadOpenCycles(ctx: TenantContext) {
  const cycles = await pageCyclesFor(getDb(), ctx, { page: 1, pageSize: 24, dir: "desc", status: "ABERTO" });
  return cycles.items.map((c) => cycleAgencyOut.parse(c));
}

export const portalProgress = (p: Awaited<ReturnType<typeof getCycleProgress>>) => progressPortalOut.parse(p);
export const portalCycle = (c: unknown) => cyclePortalOut.parse(c);

export const uuidParam = z.string().uuid();

/** Limites de envio configurados no servidor (MAX_*_MB), em bytes, so para a validacao previa na tela. */
export function loadUploadLimits(): { IMAGEM: number; DOCUMENTO: number; VIDEO: number } {
  const env = getServerEnv();
  const MB = 1024 * 1024;
  return { IMAGEM: Math.floor(env.MAX_IMAGE_MB * MB), DOCUMENTO: Math.floor(env.MAX_PDF_MB * MB), VIDEO: Math.floor(env.MAX_VIDEO_MB * MB) };
}
