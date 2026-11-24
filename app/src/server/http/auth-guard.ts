import "server-only";
import { createHash } from "node:crypto";
import { getServerEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { AppError, BadRequestError, TooManyRequestsError } from "@/server/errors";
import { INTERNAL_IP_HEADER } from "@/server/http/client-ip";
import { clientIpFromRequest } from "@/server/http/handler";
import { consumeRateLimit, isKnownGood, markKnownGood, pruneRateLimits, refundRateLimit, resetRateLimit } from "@/server/http/rate-limit";

// Limite de tentativas das rotas de autenticacao (M-1). Substitui o limitador do Better Auth (desligado em
// auth.ts), que usava um balde unico "no-trusted-ip" quando nao achava o IP: um anonimo bloqueava todos.
//
// Entrada: nas rotas sensiveis o corpo precisa ser JSON (415 caso contrario), e o guard o le UMA vez, do mesmo
// jeito que o Better Auth (UTF-8, sem BOM), e repassa a ele o JSON ja canonico. Assim nao ha diferenca entre o
// que o guard contou e o que o Better Auth processou (form-urlencoded, BOM, charset, JSON invalido). Rotas que
// precisam de identificador (login, pedido de redefinicao, redefinicao) sem identificador valido: 400, sem
// chegar ao Better Auth.
//
// Politica de baldes:
// 1. IP confiavel e valido (client-ip.ts): balde por IP e rota (toda tentativa conta).
// 2. Sem IP confiavel: nunca ha balde global. Fora o login, o balde e do identificador (e-mail, token, sessao).
// 3. Login (A-3): conta so FALHAS. A tentativa reserva uma vaga antes (atomico, sem corrida), e a vaga e
//    devolvida se o login der certo. Dois baldes de falhas por e-mail: (e-mail, IP /64) com AUTH_SIGNIN_EMAIL_MAX
//    em 15 min, e um teto por e-mail com AUTH_SIGNIN_EMAIL_GLOBAL_MAX em 15 min (so contra ataque distribuido).
//    Quem ja entrou com sucesso na conta daquele IP (30 dias) nao e barrado pelo balde (e-mail, IP), so pelo teto.
//    Assim um anonimo de outro IP nao tranca o login do dono da conta. 429 identico para conta existente ou nao.
//    Sem IP confiavel, o IP vira "sem-ip" (todos os anonimos dividem o balde do e-mail): limite honesto.
// O proxy continua responsavel por limite de volume (docs/proxy-e-ip.md).

const MAX_BODY_BYTES = 8 * 1024;
const FAIL_WINDOW_SECONDS = 15 * 60;
const KNOWN_GOOD_MAX_AGE_SECONDS = 30 * 24 * 3600;
const FAILURE_STATUSES = new Set([400, 401, 403, 422]);

export class PayloadTooLargeError extends AppError {
  constructor() {
    super("PAYLOAD_TOO_LARGE", 413, "Requisicao grande demais.");
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor() {
    super("UNSUPPORTED_MEDIA_TYPE", 415, "Envie o corpo como JSON (application/json).");
  }
}

interface Rule {
  windowSeconds: number;
  max: number;
}

const RESET_CALLBACK = /^\/reset-password\/[A-Za-z0-9_-]{10,200}$/;
const JSON_BODY_PATHS = new Set(["/sign-in/email", "/request-password-reset", "/reset-password", "/change-password"]);

function ruleFor(path: string): Rule {
  switch (path) {
    case "/sign-in/email":
      return { windowSeconds: 60, max: getServerEnv().AUTH_SIGNIN_RATE_MAX };
    case "/request-password-reset":
      return { windowSeconds: 60, max: 3 };
    case "/reset-password":
    case "/change-password":
      return { windowSeconds: 60, max: 5 };
    default:
      return { windowSeconds: 10, max: 100 };
  }
}

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

async function readBodyLimited(req: Request): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw new PayloadTooLargeError();
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isJsonContentType(header: string | null): boolean {
  return (header?.split(";")[0]?.trim().toLowerCase() ?? "") === "application/json";
}

/** Corpo JSON como objeto, lido como o Better Auth le (UTF-8, BOM removido). Qualquer outra coisa: 400. */
function parseJsonObject(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    throw new BadRequestError("JSON invalido.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestError("Envie um objeto JSON.");
  return value as Record<string, unknown>;
}

const nonEmptyString = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.length > 0 ? value.slice(0, max) : undefined;

export interface GuardedAuthRequest {
  /** Requisicao a repassar ao Better Auth: cabecalho de IP interno recalculado e corpo canonico. */
  request: Request;
  /** Chamar com o status da resposta do Better Auth: julga a tentativa de login (falha, sucesso ou nenhuma das duas). */
  finish: (status: number) => Promise<void>;
}

/**
 * Aplica o limite e devolve a requisicao saneada. Lanca TooManyRequestsError (429), PayloadTooLargeError (413),
 * UnsupportedMediaTypeError (415) ou BadRequestError (400).
 */
export async function guardAuthRequest(req: Request, path: string): Promise<GuardedAuthRequest> {
  const db = getDb();
  const env = getServerEnv();
  const ip = clientIpFromRequest(req);
  const normalized = RESET_CALLBACK.test(path) ? "/reset-password/callback" : path;
  const rule = ruleFor(normalized);
  const hasBody = req.method === "POST" && JSON_BODY_PATHS.has(normalized);

  let canonicalBody: string | null = null;
  let email: string | undefined;
  let identifier: string | undefined;
  if (hasBody) {
    if (!isJsonContentType(req.headers.get("content-type"))) throw new UnsupportedMediaTypeError();
    const body = parseJsonObject(await readBodyLimited(req));
    canonicalBody = JSON.stringify(body);
    if (normalized === "/sign-in/email" || normalized === "/request-password-reset") {
      email = nonEmptyString(body.email, 320)?.trim().toLowerCase();
      if (!email) throw new BadRequestError("Informe o e-mail.");
      identifier = email;
    } else if (normalized === "/reset-password") {
      // O Better Auth usa body.token || query.token.
      identifier = nonEmptyString(body.token, 512) ?? nonEmptyString(new URL(req.url).searchParams.get("token"), 512);
      if (!identifier) throw new BadRequestError("Informe o token.");
    } else {
      identifier = req.headers.get("cookie")?.slice(0, 2048) || undefined;
    }
  }

  if (Math.random() < 0.05) void pruneRateLimits(db).catch(() => undefined);

  if (ip) {
    const r = await consumeRateLimit(db, `app:auth-ip:${normalized}:${ip}`, rule.windowSeconds, rule.max);
    if (!r.allowed) throw new TooManyRequestsError(r.retryAfterSeconds);
  } else if (hasBody && normalized !== "/sign-in/email" && identifier) {
    const r = await consumeRateLimit(db, `app:auth-id:${normalized}:${sha(identifier)}`, rule.windowSeconds, rule.max);
    if (!r.allowed) throw new TooManyRequestsError(r.retryAfterSeconds);
  }

  let pairKey: string | null = null;
  let globalKey: string | null = null;
  let okKey: string | null = null;
  if (normalized === "/sign-in/email" && email) {
    const h = sha(email);
    pairKey = `app:auth-fail:${h}:${ip ?? "sem-ip"}`;
    globalKey = `app:auth-failall:${h}`;
    okKey = ip ? `app:auth-ok:${h}:${ip}` : null;
    const known = okKey ? await isKnownGood(db, okKey, KNOWN_GOOD_MAX_AGE_SECONDS) : false;
    let reservedPair = false;
    if (!known) {
      const r = await consumeRateLimit(db, pairKey, FAIL_WINDOW_SECONDS, env.AUTH_SIGNIN_EMAIL_MAX);
      if (!r.allowed) throw new TooManyRequestsError(r.retryAfterSeconds);
      reservedPair = true;
    }
    const g = await consumeRateLimit(db, globalKey, FAIL_WINDOW_SECONDS, env.AUTH_SIGNIN_EMAIL_GLOBAL_MAX);
    if (!g.allowed) {
      if (reservedPair) await refundRateLimit(db, pairKey);
      throw new TooManyRequestsError(g.retryAfterSeconds);
    }
    if (!reservedPair) pairKey = null; // quem ja entrou deste IP nao gasta o balde (e-mail, IP)
  }

  const headers = new Headers(req.headers);
  headers.delete(INTERNAL_IP_HEADER);
  if (ip) headers.set(INTERNAL_IP_HEADER, ip);
  let request: Request;
  if (canonicalBody !== null) {
    headers.delete("content-length");
    headers.set("content-type", "application/json");
    request = new Request(req.url, { method: req.method, headers, body: canonicalBody });
  } else {
    request = new Request(req.url, { method: req.method, headers });
  }
  return {
    request,
    finish: async (status) => {
      if (!globalKey) return;
      if (status === 200) {
        if (pairKey) await resetRateLimit(db, pairKey);
        await refundRateLimit(db, globalKey);
        if (okKey) await markKnownGood(db, okKey);
      } else if (!FAILURE_STATUSES.has(status)) {
        // 429, 5xx etc.: a tentativa nao foi julgada, devolve as vagas.
        if (pairKey) await refundRateLimit(db, pairKey);
        await refundRateLimit(db, globalKey);
      }
    },
  };
}
