import { BlockList, isIP } from "node:net";

// IP do cliente atras de proxy reverso (M-1). Regras:
// - So existe IP "confiavel" quando TRUST_PROXY=true. Sem proxy confiavel, nenhum cabecalho vale (forjavel).
// - O cabecalho vem de TRUSTED_IP_HEADER (padrao x-real-ip) e o proxy precisa SOBRESCREVE-LO (ver docs/proxy-e-ip.md).
// - Sem TRUSTED_PROXIES, o cabecalho precisa ter exatamente um valor. Com TRUSTED_PROXIES (IP ou CIDR dos
//   proxies proprios), usa-se o primeiro valor, da direita para a esquerda, que nao seja proxy proprio; valores
//   a esquerda (que o cliente pode forjar) nunca sao usados.
// - O valor e validado como IP (IPv4 ou IPv6), limitado em tamanho e normalizado (IPv4 mapeado vira IPv4; IPv6
//   vira o prefixo /64, para quem troca de endereco dentro da mesma rede nao escapar do limite).
// - IP ausente, invalido ou ambiguo devolve null. Quem chama NUNCA deve transformar null em balde global.

/** Cabecalho interno: o app o recalcula em toda requisicao de autenticacao e descarta o que vier de fora. */
export const INTERNAL_IP_HEADER = "x-nexo-client-ip";

const MAX_HEADER_LENGTH = 512;
const MAX_HOPS = 16;

export interface IpSourceConfig {
  trust: boolean;
  header: string;
  trustedProxies: readonly string[];
}

interface Canonical {
  text: string; // IPv4 pontuado ou IPv6 em 8 grupos de 4 hex
  family: "ipv4" | "ipv6";
}

function canonical(raw: string): Canonical | null {
  if (raw.length === 0 || raw.length > 45 || raw.includes("%")) return null;
  const kind = isIP(raw);
  if (kind === 4) return { text: raw, family: "ipv4" };
  if (kind !== 6) return null;
  let value = raw.toLowerCase();
  const tail = value.slice(value.lastIndexOf(":") + 1);
  if (isIP(tail) === 4) {
    const [a, b, c, d] = tail.split(".").map(Number);
    value = `${value.slice(0, value.lastIndexOf(":") + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  let groups: string[];
  if (value.includes("::")) {
    const [left, right] = value.split("::");
    const l = left ? left.split(":") : [];
    const r = right ? right.split(":") : [];
    groups = [...l, ...Array(8 - l.length - r.length).fill("0"), ...r];
  } else {
    groups = value.split(":");
  }
  if (groups.length !== 8) return null;
  const padded = groups.map((g) => g.padStart(4, "0"));
  if (padded.slice(0, 5).every((g) => g === "0000") && padded[5] === "ffff") {
    const hi = parseInt(padded[6], 16);
    const lo = parseInt(padded[7], 16);
    return { text: `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`, family: "ipv4" };
  }
  return { text: padded.join(":"), family: "ipv6" };
}

function toKey(c: Canonical): string {
  if (c.family === "ipv4") return c.text;
  return `${c.text.split(":").slice(0, 4).join(":")}:0000:0000:0000:0000`; // prefixo /64
}

/** Valida uma entrada de TRUSTED_PROXIES (IP ou CIDR). Usada pela configuracao para falhar cedo. */
export function isValidProxyEntry(entry: string): boolean {
  const [addr, prefix, extra] = entry.split("/");
  if (extra !== undefined || !addr) return false;
  const kind = isIP(addr);
  if (kind === 0 || addr.includes("%")) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (kind === 4 ? 32 : 128);
}

function buildBlockList(entries: readonly string[]): BlockList {
  const list = new BlockList();
  for (const entry of entries) {
    const [addr, prefix] = entry.split("/");
    const family = isIP(addr) === 4 ? "ipv4" : "ipv6";
    if (prefix === undefined) list.addAddress(addr, family);
    else list.addSubnet(addr, Number(prefix), family);
  }
  return list;
}

const blockListCache = new Map<string, BlockList>();
function blockListFor(entries: readonly string[]): BlockList {
  const key = entries.join(",");
  let list = blockListCache.get(key);
  if (!list) {
    list = buildBlockList(entries);
    blockListCache.set(key, list);
  }
  return list;
}

/** IP do cliente (normalizado) ou null quando nao ha IP confiavel. */
export function resolveClientIp(headers: Headers, config: IpSourceConfig): string | null {
  if (!config.trust) return null;
  const raw = headers.get(config.header);
  if (!raw || raw.length > MAX_HEADER_LENGTH) return null;
  const hops = raw.split(",").map((h) => h.trim());
  if (hops.length > MAX_HOPS || hops.some((h) => h === "")) return null;

  if (config.trustedProxies.length === 0) {
    if (hops.length !== 1) return null;
    const only = canonical(hops[0]);
    return only ? toKey(only) : null;
  }
  const proxies = blockListFor(config.trustedProxies);
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = canonical(hops[i]);
    if (!hop) return null;
    if (proxies.check(hop.text, hop.family)) continue;
    return toKey(hop);
  }
  return null;
}
