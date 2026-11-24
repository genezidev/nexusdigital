import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { AppError, ValidationError } from "@/server/errors";

// Resposta de erro padrao da API: nunca stack, nunca texto de excecao interna, nunca segredo.
export interface ErrorBody {
  error: { code: string; message: string; fields?: Record<string, string>; requestId: string };
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

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of error.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
    return errorResponse(new ValidationError(fields), requestId);
  }
  if (error instanceof AppError) {
    const body: ErrorBody = { error: { code: error.code, message: error.message, requestId } };
    if (error instanceof ValidationError) body.error.fields = error.fields;
    const retry = "retryAfterSeconds" in error ? { "Retry-After": String(error.retryAfterSeconds) } : undefined;
    return json(body, error.status, requestId, retry);
  }
  // Falha inesperada: registra so o tipo (mensagens de driver podem conter parametros de consulta).
  console.error(`[nexo] erro inesperado request=${requestId} tipo=${error instanceof Error ? error.name : typeof error}`);
  const body: ErrorBody = { error: { code: "INTERNAL", message: "Algo deu errado. Tente novamente em instantes.", requestId } };
  return json(body, 500, requestId);
}
