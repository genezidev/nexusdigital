import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { AppError, ConflictError, DomainRuleError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

// Resposta de erro padrao da API: nunca stack, nunca texto de excecao interna, nunca segredo.
export interface ErrorBody {
  error: { code: string; message: string; fields?: Record<string, string>; allowed?: string[]; requestId: string };
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function newRequestId(): string {
  return randomUUID();
}

export function json(body: unknown, status = 200, requestId?: string, extra?: HeadersInit): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8", ...NO_STORE });
  if (requestId) headers.set("X-Request-Id", requestId);
  new Headers(extra).forEach((v, k) => headers.set(k, v));
  return new Response(JSON.stringify(body), { status, headers });
}

/**
 * Sinais internos do Next (redirect, notFound, interrupcao de prerender) viajam como excecao e NAO sao
 * falhas: quem captura erros precisa deixa-los passar, senao a rota vira um 500 falso.
 */
export function isNextControlFlow(error: unknown): boolean {
  const digest = typeof error === "object" && error !== null ? (error as { digest?: unknown }).digest : undefined;
  return typeof digest === "string" && /^(NEXT_|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING|HANGING_PROMISE_REJECTION)/.test(digest);
}

/**
 * Regras que o BANCO faz valer (gatilhos, CHECK, unicidade, chave estrangeira, RLS) chegam como erro do Prisma.
 * Viram resposta padrao (409/422/403/404) em vez de 500. So o texto dos NOSSOS gatilhos ("tabela: motivo", escrito
 * por nos, sem dado de usuario) volta ao cliente; qualquer outra mensagem do driver nunca sai.
 */
export function mapDatabaseError(error: unknown): AppError | null {
  if (typeof error !== "object" || error === null) return null;
  const e = error as { name?: string; code?: string; meta?: { driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string } } } };
  if (e.name !== "PrismaClientKnownRequestError") return null;
  if (e.code === "P2002") return new ConflictError("CONFLICT", "Ja existe um registro igual.");
  if (e.code === "P2003") return new ConflictError("REFERENCE_CONFLICT", "A operacao conflita com registros relacionados.");
  if (e.code === "P2025") return new NotFoundError();
  const cause = e.meta?.driverAdapterError?.cause;
  const sqlstate = cause?.originalCode ?? "";
  const message = cause?.originalMessage ?? "";
  if (/^new row violates row-level security/i.test(message)) return new ForbiddenError();
  const ours = /^[a-z_]+: [^\r\n]{1,200}$/.test(message) ? message.replace(/^[a-z_]+: /, "") : null;
  if (sqlstate === "23505") return new ConflictError("CONFLICT", "Ja existe um registro igual.");
  if (sqlstate === "23503") return new ConflictError("REFERENCE_CONFLICT", "A operacao conflita com registros relacionados.");
  if (sqlstate === "42501" || sqlstate === "P0001") return new ConflictError("RULE_VIOLATION", ours ? `Operacao recusada: ${ours}.` : "Operacao recusada por uma regra de integridade.");
  if (sqlstate === "23514" || sqlstate === "23502" || sqlstate === "22P02") return new DomainRuleError("RULE_VIOLATION", ours ? `Operacao recusada: ${ours}.` : "Os dados violam uma regra de integridade.");
  return null;
}

export function errorResponse(error: unknown, requestId: string): Response {
  const mapped = mapDatabaseError(error);
  if (mapped) return errorResponse(mapped, requestId);
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
    return errorResponse(new ValidationError(fields), requestId);
  }
  if (error instanceof AppError) {
    const body: ErrorBody = { error: { code: error.code, message: error.message, requestId } };
    if (error instanceof ValidationError) body.error.fields = error.fields;
    if (error instanceof DomainRuleError && error.allowed.length > 0) body.error.allowed = [...error.allowed];
    const retry = "retryAfterSeconds" in error ? { "Retry-After": String(error.retryAfterSeconds) } : undefined;
    return json(body, error.status, requestId, retry);
  }
  // Falha inesperada: registra so o tipo (mensagens de driver podem conter parametros de consulta).
  console.error(`[nexo] erro inesperado request=${requestId} tipo=${error instanceof Error ? error.name : typeof error}`);
  const body: ErrorBody = { error: { code: "INTERNAL", message: "Algo deu errado. Tente novamente em instantes.", requestId } };
  return json(body, 500, requestId);
}
