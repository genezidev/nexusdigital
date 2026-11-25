import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { resolveTenantContext, type TenantContext } from "@/server/authorization/context";
import { getServerEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { NotFoundError, TooManyRequestsError, ValidationError } from "@/server/errors";
import { requireClientUser, requireStaffArea, type SessionActor } from "@/server/http/actor";
import { consumeRateLimit } from "@/server/http/rate-limit";
import { isUuid, resolveAdminClientContext } from "@/server/services/access";

// Ajudantes das rotas da fase 2. Duas portas separadas, sem autorizacao compartilhada por acidente:
//  - /api/admin/clients/[id]/...  -> adminCtx: ADMIN ou STAFF atribuido; o id da URL e so o ALVO (404 uniforme).
//  - /api/portal/...              -> portalCtx: so pessoa de cliente; o cliente vem da SESSAO, nunca da URL.

export interface Authorized {
  actor: SessionActor;
  ctx: TenantContext;
}

export async function adminCtx(req: NextRequest, clientId: string): Promise<Authorized> {
  const actor = await requireStaffArea(req.headers);
  const ctx = await resolveAdminClientContext(getDb(), actor, clientId);
  return { actor, ctx };
}

export async function portalCtx(req: NextRequest): Promise<Authorized> {
  const actor = await requireClientUser(req.headers);
  const ctx = await resolveTenantContext(getDb(), { userId: actor.userId, activeClientId: actor.activeClientId });
  return { actor, ctx };
}

/** Id de rota malformado e id inexistente respondem o MESMO 404 (nunca 500 de UUID invalido, nunca pista). */
export function uuid(value: string): string {
  if (!isUuid(value)) throw new NotFoundError();
  return value;
}

/** Querystring validada com Zod (parametros desconhecidos, como ?clientId=, sao ignorados). */
export function parseQuery<S extends z.ZodType>(req: Request, schema: S): z.output<S> {
  const raw: Record<string, string> = {};
  new URL(req.url).searchParams.forEach((v, k) => {
    raw[k] ??= v;
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
    throw new ValidationError(fields);
  }
  return parsed.data;
}

/** Limite por PESSOA (nunca balde global): chave app:<nome>:user:<id> na tabela rate_limits. */
export async function limitByUser(name: string, userId: string, rule: { windowSeconds: number; max: number }): Promise<void> {
  const result = await consumeRateLimit(getDb(), `app:${name}:user:${userId}`, rule.windowSeconds, rule.max);
  if (!result.allowed) throw new TooManyRequestsError(result.retryAfterSeconds);
}

/**
 * Mutacoes que um cliente (ou agencia) poderia repetir sem parar para encher o banco ou a auditoria append-only
 * (B-5). Um limite por PESSOA e por tipo, janela de 10 min, valores em variaveis de ambiente. O balde de cada tipo e
 * proprio (`app:mut-<tipo>:user:<id>`), entao nenhum afrouxa o limite de outro nem o do login.
 */
export type MutationLimit = "decision" | "comment" | "recording" | "content-create" | "upload-put" | "media-link" | "team";

export async function limitMutation(kind: MutationLimit, userId: string): Promise<void> {
  const env = getServerEnv();
  const max = {
    decision: env.DECISION_RATE_MAX,
    comment: env.COMMENT_RATE_MAX,
    recording: env.RECORDING_RATE_MAX,
    "content-create": env.CONTENT_CREATE_RATE_MAX,
    "upload-put": env.UPLOAD_PUT_RATE_MAX,
    "media-link": env.MEDIA_LINK_RATE_MAX,
    team: env.TEAM_RATE_MAX,
  }[kind];
  await limitByUser(`mut-${kind}`, userId, { windowSeconds: 600, max });
}

// ---------- esquemas de consulta comuns ----------

export const pageQuery = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  dir: z.enum(["asc", "desc"]).default("asc"),
};

export const q = z
  .string()
  .trim()
  .max(100)
  .optional()
  .transform((v) => (v ? v : undefined));

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a data no formato AAAA-MM-DD.");

export function pageEnvelope<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize };
}

export function monthRange(year: number, month: number): { from: Date; to: Date } {
  return { from: new Date(Date.UTC(year, month - 1, 1)), to: new Date(Date.UTC(year, month, 0)) };
}
