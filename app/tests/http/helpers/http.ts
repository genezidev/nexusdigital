import { randomInt } from "node:crypto";
import { TEST_PASSWORD } from "../../integration/helpers/world";

export const BASE = "http://127.0.0.1:3100";
/** Variante sem proxy confiavel (TRUST_PROXY=false). */
export const BASE_NO_PROXY = "http://127.0.0.1:3101";
/** Variante com TRUSTED_PROXIES e cabecalho x-forwarded-for (cadeia). */
export const BASE_CHAIN = "http://127.0.0.1:3102";
/** Variante com limites baixos de falhas por e-mail (3 por e-mail e IP, 6 por e-mail no total) e IP livre. */
export const BASE_LOW = "http://127.0.0.1:3103";
/** Variante com limites BAIXOS por pessoa nas mutacoes (decisao 2, comentario 3, gravacao 2, conteudo 3, envio dos bytes 2). */
export const BASE_MUT = "http://127.0.0.1:3104";
/** Variante com UPLOADS_ENABLED=false (o padrao do app real): sem rotas de pedido, envio e download de arquivo. */
export const BASE_NO_UPLOADS = "http://127.0.0.1:3105";
export { TEST_PASSWORD };

/** IP unico por chamada: o app de teste confia em x-real-ip (TRUST_PROXY=true, como atras do proxy) e isola o limite por IP. */
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
  /** Instancia do app (padrao BASE). */
  base?: string;
  /** Corpo cru (bytes ou texto) e Content-Type exato; contentType null = sem cabecalho. */
  rawBody?: string | Uint8Array;
  contentType?: string | null;
  /** Nao envia x-real-ip por padrao (para testar IP ausente ou forjado). */
  noIp?: boolean;
  headers?: Record<string, string>;
}

export async function http(path: string, opts: Opts = {}): Promise<Res> {
  const base = opts.base ?? BASE;
  const headers: Record<string, string> = { ...(opts.noIp ? {} : { "x-real-ip": opts.ip ?? uniqueIp() }), ...opts.headers };
  if (opts.cookie) headers.cookie = opts.cookie;
  // Origem do app, como faz o navegador. `origin: null` simula requisicao sem Origin; string simula outro site.
  const origin = opts.origin === undefined ? base : opts.origin;
  if (origin) headers.origin = origin;
  let body: string | Blob | undefined;
  if (opts.rawBody !== undefined) {
    body = typeof opts.rawBody === "string" ? opts.rawBody : new Blob([opts.rawBody as BlobPart]);
    if (opts.contentType) headers["content-type"] = opts.contentType;
  } else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }
  const res = await fetch(base + path, { method: opts.method ?? "GET", headers, body, redirect: "manual" });
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
    headers: { "content-type": "application/json", origin: BASE, "x-real-ip": ip },
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
