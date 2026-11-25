import { describe, expect, it } from "vitest";
import { getServerEnv } from "@/server/config/env";

const base = { DATABASE_URL: "postgresql://x", BETTER_AUTH_SECRET: "s".repeat(32) } as unknown as NodeJS.ProcessEnv;
const SIGNING = { STORAGE_SIGNING_SECRET: "k".repeat(32), APP_URL: "https://app.exemplo.test" };
const env = (extra: Record<string, string>): NodeJS.ProcessEnv => ({ ...base, ...extra });

describe("configuracao do servidor (M-1)", () => {
  it("em producao, TRUST_PROXY precisa estar definido de forma explicita", () => {
    expect(() => getServerEnv(env({ NODE_ENV: "production", ...SIGNING }))).toThrow(/TRUST_PROXY/);
    expect(getServerEnv(env({ NODE_ENV: "production", TRUST_PROXY: "false", ...SIGNING })).TRUST_PROXY).toBe("false");
    expect(getServerEnv(env({ NODE_ENV: "production", TRUST_PROXY: "true", ...SIGNING })).TRUST_PROXY).toBe("true");
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

  it("armazenamento: em producao o segredo das URLs assinadas e obrigatorio e a mensagem cita so o nome", () => {
    expect(() => getServerEnv(env({ NODE_ENV: "production", TRUST_PROXY: "true", APP_URL: "https://app.exemplo.test" }))).toThrow(/STORAGE_SIGNING_SECRET/);
    expect(() => getServerEnv(env({ STORAGE_SIGNING_SECRET: "curto" }))).toThrow(/STORAGE_SIGNING_SECRET/);
    const e = getServerEnv(base);
    expect([e.MAX_IMAGE_MB, e.MAX_PDF_MB, e.MAX_VIDEO_MB]).toEqual([20, 50, 2048]);
    // M-B: cota por cliente menor (10 GB), teto global e espaco livre minimo existem por padrao e sao dimensionaveis
    expect([e.STORAGE_CLIENT_QUOTA_MB, e.STORAGE_GLOBAL_QUOTA_MB, e.STORAGE_MIN_FREE_MB]).toEqual([10240, 102400, 2048]);
    expect(getServerEnv(env({ STORAGE_CLIENT_QUOTA_MB: "512", STORAGE_GLOBAL_QUOTA_MB: "0", STORAGE_MIN_FREE_MB: "100" })).STORAGE_CLIENT_QUOTA_MB).toBe(512);
    expect(() => getServerEnv(env({ STORAGE_GLOBAL_QUOTA_MB: "-1" }))).toThrow(/STORAGE_GLOBAL_QUOTA_MB/);
    expect(() => getServerEnv(env({ STORAGE_MIN_FREE_MB: "abc" }))).toThrow(/STORAGE_MIN_FREE_MB/);
    // M-A: lixeira e tetos da limpeza
    expect([e.STORAGE_TRASH_RETENTION_DAYS, e.CLEANUP_MAX_ORPHANS, e.CLEANUP_MAX_ORPHAN_RATIO]).toEqual([30, 20, 0.1]);
    expect(() => getServerEnv(env({ STORAGE_TRASH_RETENTION_DAYS: "0" }))).toThrow(/STORAGE_TRASH_RETENTION_DAYS/);
    expect(() => getServerEnv(env({ CLEANUP_MAX_ORPHAN_RATIO: "1.5" }))).toThrow(/CLEANUP_MAX_ORPHAN_RATIO/);
    // B-5: limites por pessoa configuraveis
    expect([e.UPLOAD_PUT_RATE_MAX, e.DECISION_RATE_MAX, e.COMMENT_RATE_MAX, e.RECORDING_RATE_MAX, e.CONTENT_CREATE_RATE_MAX]).toEqual([120, 60, 60, 20, 120]);
    expect(() => getServerEnv(env({ DECISION_RATE_MAX: "0" }))).toThrow(/DECISION_RATE_MAX/);
    expect([e.UPLOAD_URL_TTL_SECONDS, e.DOWNLOAD_URL_TTL_SECONDS]).toEqual([900, 60]);
    expect(() => getServerEnv(env({ MAX_VIDEO_MB: "-1" }))).toThrow(/MAX_VIDEO_MB/);
    expect(() => getServerEnv(env({ STORAGE_DRIVER: "s3" }))).toThrow(/STORAGE_DRIVER/);
  });

  // B-8: producao so inicia com APP_URL https (cookie Secure, origem confiavel e links de convite dependem dela).
  it("em producao, APP_URL e obrigatoria e precisa ser https; fora dela o padrao continua http://localhost:3000", () => {
    const prod = { NODE_ENV: "production", TRUST_PROXY: "true", STORAGE_SIGNING_SECRET: "k".repeat(32) };
    // ausente: antes caia em http://localhost:3000 sem aviso
    expect(() => getServerEnv(env(prod))).toThrow(/APP_URL/);
    // http, inclusive o antigo padrao
    for (const ruim of ["http://localhost:3000", "http://app.exemplo.test", "http://127.0.0.1:3000", "ftp://app.exemplo.test", "HTTP://APP.EXEMPLO.TEST"]) {
      expect(() => getServerEnv(env({ ...prod, APP_URL: ruim })), ruim).toThrow(/APP_URL/);
    }
    expect(() => getServerEnv(env({ ...prod, APP_URL: "nao-e-url" }))).toThrow(/APP_URL/);
    // https passa e o valor e mantido
    expect(getServerEnv(env({ ...prod, APP_URL: "https://app.exemplo.test" })).APP_URL).toBe("https://app.exemplo.test");
    // fora de producao: padrao e http sao aceitos
    expect(getServerEnv(base).APP_URL).toBe("http://localhost:3000");
    expect(getServerEnv(env({ NODE_ENV: "development", APP_URL: "http://localhost:3000" })).APP_URL).toBe("http://localhost:3000");
    // a mensagem cita so o nome da variavel, nunca o valor
    try {
      getServerEnv(env({ ...prod, APP_URL: "http://valor-secreto-xyz.exemplo.test" }));
    } catch (e) {
      expect(String(e)).not.toContain("valor-secreto-xyz");
    }
  });

  it("ALLOW_INSECURE_LOCAL_APP_URL so vale para http em localhost/127.0.0.1/[::1]; num dominio real nao tem efeito", () => {
    const prod = { NODE_ENV: "production", TRUST_PROXY: "true", STORAGE_SIGNING_SECRET: "k".repeat(32), ALLOW_INSECURE_LOCAL_APP_URL: "true" };
    for (const ok of ["http://127.0.0.1:3100", "http://localhost:3000", "http://[::1]:3000"]) expect(getServerEnv(env({ ...prod, APP_URL: ok })).APP_URL, ok).toBe(ok);
    for (const ruim of ["http://app.exemplo.test", "http://10.0.0.5:3000", "http://localhost.exemplo.test"]) {
      expect(() => getServerEnv(env({ ...prod, APP_URL: ruim })), ruim).toThrow(/APP_URL/);
    }
    // sem a variavel (ou com false) o loopback tambem e recusado
    expect(() => getServerEnv(env({ ...prod, ALLOW_INSECURE_LOCAL_APP_URL: "false", APP_URL: "http://127.0.0.1:3100" }))).toThrow(/APP_URL/);
    expect(() => getServerEnv(env({ ...prod, ALLOW_INSECURE_LOCAL_APP_URL: "sim", APP_URL: "https://app.exemplo.test" }))).toThrow(/ALLOW_INSECURE_LOCAL_APP_URL/);
  });
});
