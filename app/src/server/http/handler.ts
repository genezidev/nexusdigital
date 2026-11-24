import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { z } from "zod";
import { getServerEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { BadRequestError, ForbiddenError, PayloadTooLargeError, TooManyRequestsError, ValidationError } from "@/server/errors";
import { resolveClientIp } from "@/server/http/client-ip";
import { consumeRateLimit } from "@/server/http/rate-limit";
import { errorResponse, isNextControlFlow, newRequestId } from "@/server/http/respond";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Protecao CSRF dos handlers proprios (alem do SameSite=Lax do cookie): requisicao que muda estado
 * so passa se o Origin for a origem do app (APP_URL) ou, sem Origin, se o navegador declarar
 * Sec-Fetch-Site: same-origin. Formulario de outro site nao consegue enviar JSON com este Origin.
 */
export function assertSameOrigin(req: Request): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return;
  const allowed = new URL(getServerEnv().APP_URL).origin;
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin !== allowed) throw new ForbiddenError("Origem nao permitida.");
    return;
  }
  if (req.headers.get("sec-fetch-site") === "same-origin") return;
  throw new ForbiddenError("Origem nao permitida.");
}

/** Tamanho maximo de corpo JSON dos handlers proprios (arquivos nao passam por aqui: vao por PUT em streaming). */
export const MAX_JSON_BODY_BYTES = 1024 * 1024;

/**
 * Le o corpo como texto com TETO de tamanho, sem confiar so no Content-Length (chunked nao declara): acima do
 * teto devolve 413 e para de ler. Evita que um corpo gigante vire memoria do servidor.
 */
async function readBoundedText(req: Request, max: number): Promise<string> {
  const declared = req.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > max) {
    await req.body?.cancel().catch(() => undefined);
    throw new PayloadTooLargeError("O corpo da requisicao e grande demais.");
  }
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let total = 0;
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new PayloadTooLargeError("O corpo da requisicao e grande demais.");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Corpo JSON validado com Zod. Erro de formato = 400; corpo gigante = 413; regra de campo = 422 com mensagens em pt-BR. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) throw new BadRequestError("Envie o corpo como JSON.");
  let raw: unknown;
  try {
    raw = JSON.parse(await readBoundedText(req, MAX_JSON_BODY_BYTES));
  } catch (error) {
    if (error instanceof PayloadTooLargeError) throw error;
    throw new BadRequestError("JSON invalido.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
    throw new ValidationError(fields);
  }
  return parsed.data;
}

/**
 * IP do cliente confiavel e validado, ou null (sem proxy confiavel, cabecalho ausente, invalido, ambiguo ou
 * grande demais). Mesma logica das rotas de autenticacao (client-ip.ts).
 */
export function clientIpFromRequest(req: Request): string | null {
  const env = getServerEnv();
  return resolveClientIp(req.headers, { trust: env.TRUST_PROXY === "true", header: env.TRUSTED_IP_HEADER, trustedProxies: env.TRUSTED_PROXIES });
}

/**
 * Limite de tentativas em banco para handlers proprios (rotas publicas por token). Com IP confiavel o balde e
 * por IP; sem IP, e do `identifier` (ex.: o token); sem nenhum dos dois nao ha balde (nunca existe balde global).
 */
export async function limitRequests(
  req: Request,
  name: string,
  rule: { windowSeconds: number; max: number },
  identifier?: string,
): Promise<void> {
  const ip = clientIpFromRequest(req);
  const key = ip ? `app:${name}:ip:${ip}` : identifier ? `app:${name}:id:${createHash("sha256").update(identifier.slice(0, 512)).digest("hex")}` : null;
  if (!key) return;
  const result = await consumeRateLimit(getDb(), key, rule.windowSeconds, rule.max);
  if (!result.allowed) throw new TooManyRequestsError(result.retryAfterSeconds);
}

type Handler<P> = (req: NextRequest, ctx: { params: P; requestId: string }) => Promise<Response>;

/** Envolve um handler: origem (CSRF), id da requisicao, erros padronizados e sem cache. */
export function route<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> => {
    const requestId = newRequestId();
    try {
      assertSameOrigin(req);
      const params = await ctx.params;
      const response = await handler(req, { params, requestId });
      response.headers.set("X-Request-Id", requestId);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch (error) {
      if (isNextControlFlow(error)) throw error;
      return errorResponse(error, requestId);
    }
  };
}
