import { describe, expect, it } from "vitest";
import { attachmentDisposition, sanitizeDisplayName } from "@/server/domain/content-disposition";

// B-4: o cabecalho Content-Disposition nunca pode ficar malformado nem aceitar nome que o quebre.
const BACKSLASH = String.fromCharCode(92);
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

/** Confere a forma EXATA do cabecalho: so ASCII sem aspas nem barra invertida no `filename=`, e RFC 5987 no `filename*=`. */
function expectWellFormed(header: string) {
  const m = /^attachment; filename="([^"\\]*)"; filename\*=UTF-8''([A-Za-z0-9%._~!-]*)$/.exec(header);
  expect(m, header).not.toBeNull();
  expect(m![1]).toMatch(/^[\x20-\x7e]*$/);
  expect(header).not.toMatch(/[\r\n]/);
  expect(decodeURIComponent(m![2]).length).toBeGreaterThan(0); // nao lanca (sem substituto solto) e nao e vazio
  return { ascii: m![1], star: decodeURIComponent(m![2]) };
}

describe("Content-Disposition seguro", () => {
  it("barra invertida sai do nome (era o achado B-4: escapava a aspa de fechamento)", () => {
    const h = attachmentDisposition(`arte${BACKSLASH}final.png`);
    const { ascii, star } = expectWellFormed(h);
    expect(ascii).toBe("arte_final.png");
    expect(star).toBe("arte_final.png");
    expect(h).not.toContain(BACKSLASH);
  });

  it("nome de 119 caracteres + barra invertida, truncado em 120, continua bem formado", () => {
    const name = "a".repeat(119) + BACKSLASH + "txt";
    expect(sanitizeDisplayName(name).length).toBe(120);
    const h = attachmentDisposition(name);
    const { ascii } = expectWellFormed(h);
    expect(ascii).toBe("a".repeat(119) + "_");
    expect(h.endsWith('"; filename*=UTF-8\'\'' + "a".repeat(119) + "_")).toBe(true);
    // a barra invertida logo antes de qualquer corte, em varios tamanhos
    for (const n of [1, 5, 60, 118, 119, 120, 121, 300]) expectWellFormed(attachmentDisposition("b".repeat(n) + BACKSLASH + BACKSLASH + '"'));
  });

  it("aspas, ponto e virgula, barras, dois-pontos e porcentagem viram sublinhado", () => {
    const { ascii } = expectWellFormed(attachmentDisposition('a"b;c/d:e*f?g<h>i|j%k.png'));
    expect(ascii).toBe("a_b_c_d_e_f_g_h_i_j_k.png");
  });

  it("CRLF e caracteres de controle nao passam (nem para injetar cabecalho)", () => {
    const h = attachmentDisposition(`foto.png${CR}${LF}Set-Cookie: sessao=roubada`);
    expectWellFormed(h);
    expect(h).not.toMatch(/Set-Cookie: /);
    expect(sanitizeDisplayName(`a${CR}${LF}b${String.fromCharCode(0)}c${String.fromCharCode(0x7f)}d`)).toBe("abcd");
  });

  it("inversao de texto e caracteres invisiveis saem do nome", () => {
    expect(sanitizeDisplayName("fotogpj.png")).not.toMatch(/[‪-‮⁦-⁩]/);
    const s = sanitizeDisplayName(`foto‮gpj.png​﻿`);
    expect(s).toBe("fotogpj.png");
  });

  it("unicode: acentos e CJK vao codificados em RFC 5987 e o ASCII usa sublinhado", () => {
    const { ascii, star } = expectWellFormed(attachmentDisposition("Relatório de ação 日本.pdf"));
    expect(star).toBe("Relatório de ação 日本.pdf");
    expect(ascii).toBe("Relat_rio de a__o __.pdf");
    expect(attachmentDisposition("Relatório.pdf")).toContain("filename*=UTF-8''Relat%C3%B3rio.pdf");
  });

  it("emoji no ponto de corte nao e partido ao meio e nao derruba o encodeURIComponent", () => {
    const name = "x".repeat(119) + "😀😀";
    const out = sanitizeDisplayName(name);
    expect(Array.from(out).length).toBe(120);
    expect(out.endsWith("😀")).toBe(true);
    expect(() => attachmentDisposition(name)).not.toThrow();
    expectWellFormed(attachmentDisposition(name));
    // substituto solto na ENTRADA (nome vindo de fora) vira U+FFFD em vez de lancar URIError
    const lone = "ok" + String.fromCharCode(0xd83d) + ".png";
    expect(() => attachmentDisposition(lone)).not.toThrow();
    expectWellFormed(attachmentDisposition(lone));
  });

  it("RFC 5987: apostrofo e parenteses sao codificados no filename* (o asterisco ja sai do nome)", () => {
    const h = attachmentDisposition("a'b(c)d*e.png");
    expectWellFormed(h);
    expect(h).toContain("filename*=UTF-8''a%27b%28c%29d_e.png");
  });

  it("nome vazio, so de pontos ou so de espacos vira 'arquivo'; ponto inicial e removido; nome longo e cortado em 120", () => {
    for (const n of ["", "   ", "...", ".", "  . "]) expect(sanitizeDisplayName(n), JSON.stringify(n)).toBe("arquivo");
    expect(sanitizeDisplayName(".hidden.png")).toBe("hidden.png");
    expect(sanitizeDisplayName("n".repeat(500)).length).toBe(120);
    expectWellFormed(attachmentDisposition("n".repeat(500)));
    expect(attachmentDisposition("")).toBe("attachment; filename=\"arquivo\"; filename*=UTF-8''arquivo");
  });

  it("sempre attachment, nunca inline", () => {
    for (const n of ["a.png", "inline.html", `${BACKSLASH}`, '"'])
      expect(attachmentDisposition(n).startsWith("attachment; ")).toBe(true);
  });
});
