import { randomInt } from "node:crypto";
import { TEST_PASSWORD } from "../../integration/helpers/world";

export const BASE = "http://127.0.0.1:3100";
export { TEST_PASSWORD };

/** IP unico por chamada: o app de teste confia em x-forwarded-for (TRUST_PROXY) e isola o limite por IP. */
export function uniqueIp(): string {
  return `10.${randomInt(1, 250)}.${randomInt(1, 250)}.${randomInt(1, 250)}`;
}

export interface Res {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
}

export interface Opts {
  method?: string;
  cookie?: string;
  body?: unknown;
  origin?: string | null;
  ip?: string;
  headers?: Record<string, string>;
}

export async function http(path: string, opts: Opts = {}): Promise<Res> {
  const headers: Record<string, string> = { "x-forwarded-for": opts.ip ?? uniqueIp(), ...opts.headers };
  if (opts.cookie) headers.cookie = opts.cookie;
  // Origem do app, como faz o navegador. `origin: null` simula requisicao sem Origin; string simula outro site.
  const origin = opts.origin === undefined ? BASE : opts.origin;
  if (origin) headers.origin = origin;
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }
  const res = await fetch(BASE + path, { method: opts.method ?? "GET", headers, body, redirect: "manual" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // pagina HTML ou corpo vazio
  }
  return { status: res.status, headers: res.headers, text, json };
}

/** Entra pelo endpoint real e devolve o cookie de sessao (so o par nome=valor). */
export async function login(email: string, password: string = TEST_PASSWORD, ip: string = uniqueIp()): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) throw new Error(`login falhou (${res.status})`);
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

export const err = (r: Res) => (r.json as { error?: { code?: string; message?: string; fields?: Record<string, string> } } | null)?.error;

/** Nenhuma resposta de erro pode carregar stack, caminho de arquivo ou texto de driver. */
export function expectNoLeak(r: Res) {
  const t = r.text;
  if (/\bat\s+\S+\s+\(|node_modules|\.next\/|prisma|PrismaClient|SELECT |INSERT |stack/i.test(t)) {
    throw new Error(`vazamento na resposta ${r.status}: ${t.slice(0, 200)}`);
  }
}
