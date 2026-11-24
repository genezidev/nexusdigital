// Validacao pura de link externo (gravacao, referencia, publicacao). O servidor NUNCA busca nem
// pre-visualiza o endereco (sem unfurl) e nunca segue redirecionamento: aqui so se decide se o texto e aceito.
// Regras da spec 0002 ("Links nao HTTPS e SSRF").

export type LinkRejection =
  | "EMPTY"
  | "TOO_LONG"
  | "BAD_CHARACTERS"
  | "NOT_HTTPS"
  | "INVALID_URL"
  | "CREDENTIALS"
  | "PORT"
  | "IP_LITERAL"
  | "INTERNAL_HOST"
  | "DOMAIN_NOT_ALLOWED";

export type LinkResult = { ok: true; href: string; host: string } | { ok: false; reason: LinkRejection };

const INTERNAL_SUFFIXES = [".local", ".internal", ".localhost", ".localdomain", ".lan", ".intranet", ".corp", ".home"];

export interface LinkOptions {
  /** Se informado, o host precisa ser um destes dominios ou subdominio deles. */
  allowedDomains?: readonly string[];
}

export function validateHttpsLink(raw: string, options: LinkOptions = {}): LinkResult {
  if (typeof raw !== "string" || raw.length === 0) return { ok: false, reason: "EMPTY" };
  if (raw.length > 2048) return { ok: false, reason: "TOO_LONG" };
  if (/[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u.test(raw)) return { ok: false, reason: "BAD_CHARACTERS" };
  if (!/^https:\/\//i.test(raw)) return { ok: false, reason: "NOT_HTTPS" }; // http:, javascript:, data:, file:, //host
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "INVALID_URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "NOT_HTTPS" };
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "CREDENTIALS" };
  if (url.port !== "" && url.port !== "443") return { ok: false, reason: "PORT" };
  // O parser do WHATWG normaliza formas numericas (2130706433, 0x7f.1) para a forma pontuada.
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "") return { ok: false, reason: "INVALID_URL" };
  if (host.startsWith("[") || /^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return { ok: false, reason: "IP_LITERAL" };
  if (!host.includes(".") || host === "localhost" || INTERNAL_SUFFIXES.some((s) => host.endsWith(s))) {
    return { ok: false, reason: "INTERNAL_HOST" };
  }
  if (options.allowedDomains) {
    const allowed = options.allowedDomains.map((d) => d.toLowerCase());
    if (!allowed.some((d) => host === d || host.endsWith(`.${d}`))) return { ok: false, reason: "DOMAIN_NOT_ALLOWED" };
  }
  return { ok: true, href: url.href, host };
}

/** Dominios de gravacao autorizados por padrao (o ADMIN altera a lista; ver spec 0002, Suposicoes). */
export const DEFAULT_RECORDING_DOMAINS: readonly string[] = [
  "drive.google.com",
  "docs.google.com",
  "dropbox.com",
  "wetransfer.com",
  "we.tl",
  "icloud.com",
  "youtube.com",
  "youtu.be",
  "vimeo.com",
];

/** Link de publicacao de Instagram precisa ser de instagram.com. */
export const INSTAGRAM_DOMAINS: readonly string[] = ["instagram.com"];
