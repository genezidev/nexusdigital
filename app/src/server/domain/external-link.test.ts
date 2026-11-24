import { describe, expect, it } from "vitest";
import { DEFAULT_RECORDING_DOMAINS, validateHttpsLink } from "@/server/domain/external-link";

describe("validateHttpsLink (sem rede: so decide sobre o texto)", () => {
  const recusados: [string, string][] = [
    ["http://drive.google.com/x", "NOT_HTTPS"],
    ["javascript:alert(1)", "NOT_HTTPS"],
    ["data:text/html;base64,PHNjcmlwdD4=", "NOT_HTTPS"],
    ["file:///etc/passwd", "NOT_HTTPS"],
    ["//drive.google.com/x", "NOT_HTTPS"],
    ["ftp://drive.google.com/x", "NOT_HTTPS"],
    ["https://127.0.0.1/x", "IP_LITERAL"],
    ["https://[::1]/x", "IP_LITERAL"],
    ["https://169.254.169.254/latest/meta-data", "IP_LITERAL"],
    ["https://10.0.0.5/x", "IP_LITERAL"],
    ["https://192.168.1.1/x", "IP_LITERAL"],
    ["https://172.16.0.1/x", "IP_LITERAL"],
    ["https://2130706433/x", "IP_LITERAL"],
    ["https://0x7f.0.0.1/x", "IP_LITERAL"],
    ["https://[fc00::1]/x", "IP_LITERAL"],
    ["https://usuario:senha@drive.google.com/x", "CREDENTIALS"],
    ["https://usuario@drive.google.com/x", "CREDENTIALS"],
    ["https://drive.google.com:8443/x", "PORT"],
    ["https://x.internal/x", "INTERNAL_HOST"],
    ["https://servidor.local/x", "INTERNAL_HOST"],
    ["https://localhost/x", "INTERNAL_HOST"],
    ["https://api.localhost/x", "INTERNAL_HOST"],
    ["https://intranet/x", "INTERNAL_HOST"],
    ["https://exemplo.com/a b", "BAD_CHARACTERS"],
    ["https://exemplo.com/\n", "BAD_CHARACTERS"],
    ["https://exemplo.com/‮txt", "BAD_CHARACTERS"],
    ["", "EMPTY"],
    ["https://" + "a".repeat(2050) + ".com", "TOO_LONG"],
  ];
  it.each(recusados)("recusa %s", (url, reason) => {
    expect(validateHttpsLink(url)).toEqual({ ok: false, reason });
  });

  it("aceita HTTPS de dominio publico, com ou sem :443, e normaliza o host", () => {
    expect(validateHttpsLink("https://Drive.Google.com/file/d/abc")).toMatchObject({ ok: true, host: "drive.google.com" });
    expect(validateHttpsLink("https://vimeo.com:443/123")).toMatchObject({ ok: true, host: "vimeo.com" });
  });

  it("lista de dominios autorizados: dominio exato ou subdominio, nunca sufixo enganoso", () => {
    const o = { allowedDomains: DEFAULT_RECORDING_DOMAINS };
    expect(validateHttpsLink("https://drive.google.com/x", o).ok).toBe(true);
    expect(validateHttpsLink("https://www.dropbox.com/s/x", o).ok).toBe(true);
    expect(validateHttpsLink("https://exemplo-malicioso.com/x", o)).toEqual({ ok: false, reason: "DOMAIN_NOT_ALLOWED" });
    expect(validateHttpsLink("https://notdropbox.com/x", o)).toEqual({ ok: false, reason: "DOMAIN_NOT_ALLOWED" });
    expect(validateHttpsLink("https://dropbox.com.evil.example/x", o)).toEqual({ ok: false, reason: "DOMAIN_NOT_ALLOWED" });
  });

  it("nao faz chamada de rede: fetch e proibido durante a validacao", () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("rede proibida");
    }) as typeof fetch;
    try {
      expect(validateHttpsLink("https://drive.google.com/x").ok).toBe(true);
      expect(validateHttpsLink("https://169.254.169.254/x").ok).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });
});
