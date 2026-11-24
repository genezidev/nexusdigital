import { describe, expect, it } from "vitest";
import { getServerEnv } from "@/server/config/env";

const base = { DATABASE_URL: "postgresql://x", BETTER_AUTH_SECRET: "s".repeat(32) } as unknown as NodeJS.ProcessEnv;
const env = (extra: Record<string, string>): NodeJS.ProcessEnv => ({ ...base, ...extra });

describe("configuracao do servidor (M-1)", () => {
  it("em producao, TRUST_PROXY precisa estar definido de forma explicita", () => {
    expect(() => getServerEnv(env({ NODE_ENV: "production" }))).toThrow(/TRUST_PROXY/);
    expect(getServerEnv(env({ NODE_ENV: "production", TRUST_PROXY: "false" })).TRUST_PROXY).toBe("false");
    expect(getServerEnv(env({ NODE_ENV: "production", TRUST_PROXY: "true" })).TRUST_PROXY).toBe("true");
  });

  it("fora de producao o padrao e false (nenhum cabecalho de IP vale)", () => {
    expect(getServerEnv(env({ NODE_ENV: "development" })).TRUST_PROXY).toBe("false");
    expect(getServerEnv(base).TRUST_PROXY).toBe("false");
  });

  it("valor invalido de TRUST_PROXY e recusado, e a mensagem nao imprime valores", () => {
    expect(() => getServerEnv(env({ TRUST_PROXY: "sim" }))).toThrow(/TRUST_PROXY/);
    try {
      getServerEnv(env({ TRUST_PROXY: "valor-secreto-xyz" }));
    } catch (e) {
      expect(String(e)).not.toContain("valor-secreto-xyz");
    }
  });

  it("TRUSTED_IP_HEADER: padrao x-real-ip, normaliza para minusculas e recusa nomes invalidos", () => {
    expect(getServerEnv(base).TRUSTED_IP_HEADER).toBe("x-real-ip");
    expect(getServerEnv(env({ TRUSTED_IP_HEADER: "CF-Connecting-IP" })).TRUSTED_IP_HEADER).toBe("cf-connecting-ip");
    expect(() => getServerEnv(env({ TRUSTED_IP_HEADER: "x real ip" }))).toThrow(/TRUSTED_IP_HEADER/);
    expect(() => getServerEnv(env({ TRUSTED_IP_HEADER: "x-nexo-client-ip" }))).toThrow(/TRUSTED_IP_HEADER/);
  });

  it("TRUSTED_PROXIES: lista de IPs/CIDRs validos; entrada invalida derruba a configuracao", () => {
    expect(getServerEnv(env({ TRUSTED_PROXIES: "10.0.0.0/8, 127.0.0.1 ,::1" })).TRUSTED_PROXIES).toEqual(["10.0.0.0/8", "127.0.0.1", "::1"]);
    expect(getServerEnv(base).TRUSTED_PROXIES).toEqual([]);
    for (const ruim of ["10.0.0.0/33", "nao-e-ip", "10.0.0.1/abc", "1.2.3.4/8/9"]) {
      expect(() => getServerEnv(env({ TRUSTED_PROXIES: ruim }))).toThrow(/TRUSTED_PROXIES/);
    }
  });
});
