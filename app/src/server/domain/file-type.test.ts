import { describe, expect, it } from "vitest";
import { attachmentDisposition, sanitizeDisplayName } from "@/server/domain/content-disposition";
import { detectFileType, extensionMatches, verifyUploadedType } from "@/server/domain/file-type";

const bytes = (...parts: (number[] | string)[]) => Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const pad = (b: Uint8Array, n = 64) => {
  const out = new Uint8Array(Math.max(n, b.length));
  out.set(b);
  return out;
};

const JPEG = pad(bytes([0xff, 0xd8, 0xff, 0xe0]));
const PNG = pad(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const WEBP = pad(bytes("RIFF", [1, 2, 3, 4], "WEBP"));
const PDF = pad(bytes("%PDF-1.7\n"));
const MP4 = pad(bytes([0, 0, 0, 0x18], "ftypisom"));
const MOV = pad(bytes([0, 0, 0, 0x14], "ftypqt  "));
const WEBM = pad(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84], "webm"));

describe("tipo real pelos primeiros bytes (R-5)", () => {
  it("reconhece os sete tipos permitidos", () => {
    expect(detectFileType(JPEG)).toBe("image/jpeg");
    expect(detectFileType(PNG)).toBe("image/png");
    expect(detectFileType(WEBP)).toBe("image/webp");
    expect(detectFileType(PDF)).toBe("application/pdf");
    expect(detectFileType(MP4)).toBe("video/mp4");
    expect(detectFileType(MOV)).toBe("video/quicktime");
    expect(detectFileType(WEBM)).toBe("video/webm");
  });

  it("recusa executavel, script, HTML, SVG, XML, ZIP/Office, ELF, Matroska, HEIC e vazio", () => {
    const refused: Record<string, Uint8Array> = {
      "exe (MZ)": pad(bytes("MZ\x90\x00")),
      elf: pad(bytes([0x7f], "ELF")),
      shell: pad(bytes("#!/bin/sh\necho oi\n")),
      html: pad(bytes("<!DOCTYPE html><html><script>alert(1)</script>")),
      "html minusculo": pad(bytes("<html><body>")),
      svg: pad(bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')),
      xml: pad(bytes('<?xml version="1.0"?><x/>')),
      "zip/docx/xlsm": pad(bytes("PK\x03\x04")),
      matroska: pad(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88], "matroska")),
      heic: pad(bytes([0, 0, 0, 0x18], "ftypheic")),
      "ftyp com marca desconhecida": pad(bytes([0, 0, 0, 0x18], "ftypXXXX")),
      riff_avi: pad(bytes("RIFF", [1, 2, 3, 4], "AVI ")),
      vazio: new Uint8Array(0),
      "texto qualquer": pad(bytes("ola mundo")),
    };
    for (const [nome, head] of Object.entries(refused)) expect(detectFileType(head), nome).toBeNull();
  });

  it("verifyUploadedType: tipo declarado, extensao e conteudo precisam concordar", () => {
    expect(verifyUploadedType({ head: PNG, declaredMime: "image/png", originalName: "arte.PNG" })).toEqual({ ok: true, mime: "image/png" });
    // executavel disfarcado de imagem, com tudo "certo" no nome e no tipo declarado
    expect(verifyUploadedType({ head: pad(bytes("MZ")), declaredMime: "image/png", originalName: "arte.png" })).toEqual({ ok: false, code: "TYPE_UNRECOGNIZED" });
    // MIME mentiroso: PNG de verdade declarado como JPEG
    expect(verifyUploadedType({ head: PNG, declaredMime: "image/jpeg", originalName: "arte.jpg" })).toEqual({ ok: false, code: "TYPE_MISMATCH" });
    // extensao trocada: PDF de verdade com nome .png
    expect(verifyUploadedType({ head: PDF, declaredMime: "application/pdf", originalName: "arte.png" })).toEqual({ ok: false, code: "EXTENSION_MISMATCH" });
    // sem extensao
    expect(verifyUploadedType({ head: PDF, declaredMime: "application/pdf", originalName: "roteiro" })).toEqual({ ok: false, code: "EXTENSION_MISMATCH" });
    expect(extensionMatches("foto.jpeg", "image/jpeg")).toBe(true);
    expect(extensionMatches(".jpg", "image/jpeg")).toBe(false);
  });
});

describe("Content-Disposition seguro", () => {
  it("sempre attachment, sem aspas, quebra de linha, barra nem inversao de texto", () => {
    const evil = 'a"; filename=x.html\r\nSet-Cookie: x=1‮gnp.exe/../../etc/passwd';
    const header = attachmentDisposition(evil);
    expect(header.startsWith("attachment; ")).toBe(true);
    expect(header).not.toMatch(/[\r\n‮]/);
    expect(header.match(/"/g)?.length).toBe(2); // so as aspas do filename
    expect(header).not.toContain("/");
    expect(sanitizeDisplayName("../../x")).not.toContain("/");
    expect(sanitizeDisplayName("   ")).toBe("arquivo");
    expect(sanitizeDisplayName("a".repeat(500)).length).toBeLessThanOrEqual(120);
  });

  it("nome acentuado vai em filename* (UTF-8) e em ASCII no filename", () => {
    const h = attachmentDisposition("Relatório Março.pdf");
    expect(h).toContain("filename*=UTF-8''Relat%C3%B3rio%20Mar%C3%A7o.pdf");
    expect(h).toMatch(/filename="Relat_rio Mar_o\.pdf"/);
  });
});
