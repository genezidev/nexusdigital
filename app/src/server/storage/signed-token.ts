import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

// Token assinado (HMAC-SHA256) das URLs de envio e de download (R-5, D-0016). Vale por poucos minutos e fica
// VINCULADO ao arquivo, ao cliente e a pessoa. Ele sozinho nao autoriza nada: quem entrega o arquivo reconfere
// sessao, participacao e visibilidade a cada requisicao. Puro: segredo e relogio entram por parametro.

export type TokenPurpose = "upload" | "download";

export interface TokenClaims {
  purpose: TokenPurpose;
  assetId: string;
  clientId: string;
  userId: string;
  /** Instante de expiracao, em segundos desde 1970. */
  expiresAt: number;
}

const VERSION = 1;
const b64 = (buf: Buffer) => buf.toString("base64url");

function mac(secret: Buffer, payload: string): Buffer {
  return createHmac("sha256", secret).update(`nexo-file-token-v${VERSION}.${payload}`).digest();
}

export function signToken(secret: Buffer, claims: TokenClaims): string {
  const payload = b64(Buffer.from(JSON.stringify({ v: VERSION, p: claims.purpose, a: claims.assetId, c: claims.clientId, u: claims.userId, e: claims.expiresAt })));
  return `${payload}.${b64(mac(secret, payload))}`;
}

export type TokenCheck =
  | { ok: true; claims: TokenClaims }
  | { ok: false; reason: "MALFORMED" | "BAD_SIGNATURE" };

/**
 * Confere forma e assinatura (tempo constante). NAO confere validade nem pessoa: isso e decisao do chamador, que
 * precisa responder diferente a "assinatura invalida" (404 para todos) e "vencido" (410 so para a pessoa certa).
 */
export function verifyToken(secret: Buffer, token: string, expectedPurpose: TokenPurpose): TokenCheck {
  if (typeof token !== "string" || token.length > 600) return { ok: false, reason: "MALFORMED" };
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return { ok: false, reason: "MALFORMED" };
  const given = Buffer.from(parts[1], "base64url");
  const expected = mac(secret, parts[0]);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "BAD_SIGNATURE" };
  try {
    const raw = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Record<string, unknown>;
    if (raw.v !== VERSION || raw.p !== expectedPurpose) return { ok: false, reason: "MALFORMED" };
    const { a, c, u, e } = raw;
    if (typeof a !== "string" || typeof c !== "string" || typeof u !== "string" || typeof e !== "number" || !Number.isFinite(e)) return { ok: false, reason: "MALFORMED" };
    return { ok: true, claims: { purpose: expectedPurpose, assetId: a, clientId: c, userId: u, expiresAt: e } };
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
}

export function isExpired(claims: Pick<TokenClaims, "expiresAt">, now: Date): boolean {
  return Math.floor(now.getTime() / 1000) >= claims.expiresAt;
}

/** Segredo de assinatura: STORAGE_SIGNING_SECRET, ou (so fora de producao) derivado do BETTER_AUTH_SECRET. */
export function signingSecret(env: { STORAGE_SIGNING_SECRET?: string; BETTER_AUTH_SECRET: string; NODE_ENV?: string }): Buffer {
  if (env.STORAGE_SIGNING_SECRET) return Buffer.from(env.STORAGE_SIGNING_SECRET, "utf8");
  if (env.NODE_ENV === "production") throw new Error("STORAGE_SIGNING_SECRET ausente");
  return Buffer.from(hkdfSync("sha256", env.BETTER_AUTH_SECRET, "", "nexo-storage-signing-v1", 32));
}
