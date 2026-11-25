import { describe, expect, it } from "vitest";
import { checkAssetDeclaration, hasBlockedExtension, maxBytesFor, ruleForMime } from "@/server/domain/asset-policy";
import { newStorageKey } from "@/server/storage/keys";

describe("politica de arquivos", () => {
  it("aceita tipos permitidos dentro do limite", () => {
    expect(checkAssetDeclaration({ originalName: "arte.png", mimeType: "image/png", bytes: 1000 })).toEqual({ ok: true, category: "IMAGEM" });
    expect(checkAssetDeclaration({ originalName: "roteiro.pdf", mimeType: "application/pdf", bytes: 50 * 1024 * 1024 })).toEqual({ ok: true, category: "DOCUMENTO" });
    expect(checkAssetDeclaration({ originalName: "v.mp4", mimeType: "video/mp4", bytes: 2 * 1024 ** 3 })).toEqual({ ok: true, category: "VIDEO" });
  });
  it("recusa acima do limite, vazio e tipo fora da lista", () => {
    expect(checkAssetDeclaration({ originalName: "a.png", mimeType: "image/png", bytes: 20 * 1024 * 1024 + 1 })).toEqual({ ok: false, code: "TOO_LARGE" });
    expect(checkAssetDeclaration({ originalName: "a.png", mimeType: "image/png", bytes: 0 })).toEqual({ ok: false, code: "EMPTY" });
    for (const mime of ["text/html", "image/svg+xml", "application/xml", "application/x-msdownload", "application/octet-stream"]) {
      expect(checkAssetDeclaration({ originalName: "a.png", mimeType: mime, bytes: 10 })).toEqual({ ok: false, code: "TYPE_NOT_ALLOWED" });
    }
  });
  it("bloqueia extensao perigosa, dupla extensao e maiuscula", () => {
    for (const n of ["a.exe", "foto.jpg.exe", "A.EXE", "x.Html", "logo.svg", "m.docm", "run.sh", "a.jpg.php.png"]) expect(hasBlockedExtension(n), n).toBe(true);
    for (const n of ["foto.jpg", "relatorio.final.pdf", "sem-extensao"]) expect(hasBlockedExtension(n), n).toBe(false);
    expect(checkAssetDeclaration({ originalName: "foto.jpg.exe", mimeType: "image/jpeg", bytes: 10 })).toEqual({ ok: false, code: "BLOCKED_EXTENSION" });
  });
  // B-3: o tipo vem do navegador; nomes herdados de Object nunca podem virar uma regra valida.
  it("__proto__, constructor, toString, hasOwnProperty e afins nao sao tipo permitido (nem com maiusculas)", () => {
    const heranca = ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "__defineGetter__", "__lookupGetter__", "CONSTRUCTOR", "__PROTO__", "prototype"];
    for (const mime of heranca) {
      expect(checkAssetDeclaration({ originalName: "a.png", mimeType: mime, bytes: 10 }), mime).toEqual({ ok: false, code: "TYPE_NOT_ALLOWED" });
      expect(maxBytesFor(mime), mime).toBeNull();
      expect(ruleForMime(mime), mime).toBeUndefined();
    }
  });
  it("so a chave exata da lista vale: parecidos, com espaco ou com parametro sao recusados", () => {
    expect(ruleForMime("IMAGE/PNG")).toMatchObject({ category: "IMAGEM" });
    for (const mime of ["image/png ", " image/png", "image/png; charset=binary", "image/*", "", "image", "application/pdf\u0000"]) {
      expect(ruleForMime(mime), JSON.stringify(mime)).toBeUndefined();
      expect(checkAssetDeclaration({ originalName: "a.png", mimeType: mime, bytes: 10 })).toEqual({ ok: false, code: "TYPE_NOT_ALLOWED" });
    }
  });
  it("chave de storage aleatoria, por cliente, sem extensao", () => {
    const c = "11111111-1111-4111-8111-111111111111";
    const a = newStorageKey(c);
    expect(a).toMatch(/^clients\/11111111-1111-4111-8111-111111111111\/[0-9a-f-]{36}$/);
    expect(newStorageKey(c)).not.toBe(a);
  });
});
