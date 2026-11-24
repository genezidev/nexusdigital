import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext (destino pos-login)", () => {
  it("aceita so caminho interno", () => {
    expect(safeNext("/admin/clients?q=a")).toBe("/admin/clients?q=a");
    expect(safeNext("/portal")).toBe("/portal");
  });
  it("recusa URL externa, protocolo relativo, barra invertida e caracteres de controle", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "/ok\nSet-Cookie: x", "admin", ""]) {
      expect(safeNext(bad), bad).toBe("/");
    }
  });
  it("nao volta para telas publicas nem para a API", () => {
    for (const bad of ["/login", "/login?next=/x", "/api/auth/sign-out", "/invite/abc", "/reset-password?token=1"]) {
      expect(safeNext(bad), bad).toBe("/");
    }
  });
  it("usa o primeiro valor quando vier lista e padrao quando ausente", () => {
    expect(safeNext(["/admin", "/portal"])).toBe("/admin");
    expect(safeNext(undefined)).toBe("/");
  });
});
