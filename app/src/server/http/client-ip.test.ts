import { describe, expect, it } from "vitest";
import { resolveClientIp, type IpSourceConfig } from "@/server/http/client-ip";

const cfg = (extra: Partial<IpSourceConfig> = {}): IpSourceConfig => ({ trust: true, header: "x-real-ip", trustedProxies: [], ...extra });
const h = (value: string | null, name = "x-real-ip") => new Headers(value === null ? {} : { [name]: value });

describe("resolveClientIp (M-1)", () => {
  it("sem proxy confiavel nenhum cabecalho vale", () => {
    expect(resolveClientIp(h("203.0.113.9"), cfg({ trust: false }))).toBeNull();
  });

  it("aceita IPv4 e IPv6 validos e normaliza (IPv4 mapeado vira IPv4; IPv6 vira o prefixo /64)", () => {
    expect(resolveClientIp(h("203.0.113.9"), cfg())).toBe("203.0.113.9");
    expect(resolveClientIp(h("::ffff:203.0.113.9"), cfg())).toBe("203.0.113.9");
    expect(resolveClientIp(h("2001:DB8::1"), cfg())).toBe("2001:0db8:0000:0000:0000:0000:0000:0000");
    expect(resolveClientIp(h("2001:db8:0:0:ffff::5"), cfg())).toBe(resolveClientIp(h("2001:db8::9"), cfg()));
  });

  it("recusa valor invalido, ausente, vazio, com zona, enorme ou com texto", () => {
    for (const ruim of ["", "   ", "nao-e-ip", "999.1.1.1", "1.2.3", "01.2.3.4", "1.2.3.4:80", "fe80::1%eth0", "a".repeat(600), "<script>"]) {
      expect(resolveClientIp(h(ruim), cfg()), JSON.stringify(ruim).slice(0, 30)).toBeNull();
    }
    expect(resolveClientIp(h(null), cfg())).toBeNull();
  });

  it("sem TRUSTED_PROXIES, cadeia com varios valores e ambigua e recusada (o primeiro e forjavel)", () => {
    expect(resolveClientIp(h("1.1.1.1, 203.0.113.9"), cfg({ header: "x-forwarded-for" }))).toBeNull();
    expect(resolveClientIp(h("1.1.1.1, 203.0.113.9", "x-forwarded-for"), cfg({ header: "x-forwarded-for" }))).toBeNull();
    expect(resolveClientIp(h("1.1.1.1,", "x-forwarded-for"), cfg({ header: "x-forwarded-for" }))).toBeNull();
  });

  it("com TRUSTED_PROXIES, usa o primeiro valor da direita que nao e proxy proprio e ignora o que o cliente forjou a esquerda", () => {
    const c = cfg({ header: "x-forwarded-for", trustedProxies: ["10.0.0.0/8", "192.0.2.1"] });
    expect(resolveClientIp(h("6.6.6.6, 203.0.113.9, 10.1.1.1", "x-forwarded-for"), c)).toBe("203.0.113.9");
    expect(resolveClientIp(h("203.0.113.9", "x-forwarded-for"), c)).toBe("203.0.113.9");
    expect(resolveClientIp(h("203.0.113.9, 192.0.2.1, 10.2.2.2", "x-forwarded-for"), c)).toBe("203.0.113.9");
    // So proxies na cadeia: nao ha cliente; texto invalido no meio: recusa
    expect(resolveClientIp(h("10.1.1.1, 10.2.2.2", "x-forwarded-for"), c)).toBeNull();
    expect(resolveClientIp(h("6.6.6.6, lixo, 10.1.1.1", "x-forwarded-for"), c)).toBeNull();
  });

  it("limita o numero de saltos", () => {
    const c = cfg({ header: "x-forwarded-for", trustedProxies: ["10.0.0.0/8"] });
    expect(resolveClientIp(h(Array(40).fill("10.0.0.1").join(","), "x-forwarded-for"), c)).toBeNull();
  });
});
