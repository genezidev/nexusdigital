import { describe, expect, it } from "vitest";
import { buildMonthGrid, daysInMonth, shiftMonth } from "@/lib/calendar-grid";
import { competenceLabel, formatBytes, formatDay, formatDuration, formatPercent, isOverdue, progressSummary, todayIsoIn } from "@/lib/labels";
import { declaredMimeType, uploadErrorMessage, validateFileBeforeUpload } from "@/lib/upload-rules";

const MB = 1024 * 1024;
const limits = { IMAGEM: 1 * MB, DOCUMENTO: 2 * MB, VIDEO: 16 * MB };

describe("datas e rotulos da fase 2", () => {
  it("data civil vira DD/MM/AAAA sem deslocar pelo fuso", () => {
    expect(formatDay("2026-11-30")).toBe("30/11/2026");
    expect(formatDay("2026-11-30T00:00:00.000Z")).toBe("30/11/2026");
    expect(formatDay(null)).toBe("N/D");
    expect(formatDay("lixo")).toBe("N/D");
  });
  it("competencia em portugues", () => {
    expect(competenceLabel(2026, 11)).toBe("novembro de 2026");
    expect(competenceLabel(2026, 3)).toBe("março de 2026");
  });
  it("hoje no fuso do cliente (virada de dia em Maceio, UTC-3)", () => {
    expect(todayIsoIn("America/Maceio", new Date("2026-11-25T02:30:00Z"))).toBe("2026-11-24");
    expect(todayIsoIn("Fuso/Invalido", new Date("2026-11-25T02:30:00Z"))).toBe("2026-11-25");
  });
  it("atraso e selo: so quando a data passou e a peca nao foi publicada, analisada nem cancelada", () => {
    expect(isOverdue("2026-11-10", "EM_PRODUCAO", "2026-11-24")).toBe(true);
    expect(isOverdue("2026-11-24", "EM_PRODUCAO", "2026-11-24")).toBe(false);
    for (const s of ["PUBLICADO", "ANALISADO", "CANCELADO"]) expect(isOverdue("2026-11-10", s, "2026-11-24")).toBe(false);
  });
  it("tamanhos e duracoes legiveis", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(5 * MB)).toBe("5,0 MB");
    expect(formatBytes(null)).toBe("N/D");
    expect(formatDuration(90)).toBe("1 min 30 s");
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(null)).toBe("N/D");
  });
  it("progresso: sem cota mostra texto honesto e nunca zero enganoso", () => {
    expect(formatPercent(null)).toBe("N/D");
    expect(progressSummary({ quota: 0, hasQuota: false, percent: null, published: 3 })).toBe("Sem cota definida");
    expect(progressSummary({ quota: 12, hasQuota: true, percent: 58, published: 7 })).toBe("7 de 12 publicadas (58%)");
  });
});

describe("grade do calendario", () => {
  it("novembro de 2026 comeca no domingo e tem 5 semanas", () => {
    const weeks = buildMonthGrid(2026, 11, []);
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toMatchObject({ iso: "2026-11-01", inMonth: true });
    expect(weeks[4][1]).toMatchObject({ iso: "2026-11-30", inMonth: true });
    expect(weeks[4][2]).toMatchObject({ iso: "2026-12-01", inMonth: false });
  });
  it("completa com dias do mes anterior e distribui as pecas pelo dia", () => {
    const weeks = buildMonthGrid(2026, 10, [
      { id: "a", plannedOn: "2026-10-05" },
      { id: "b", plannedOn: "2026-10-05" },
      { id: "c", plannedOn: "2026-10-31" },
    ]);
    expect(weeks[0][0]).toMatchObject({ iso: "2026-09-27", inMonth: false });
    const flat = weeks.flat();
    expect(flat.find((c) => c.iso === "2026-10-05")?.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(flat.reduce((n, c) => n + c.items.length, 0)).toBe(3);
  });
  it("virada de ano e meses com 28/29 dias", () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2027, 2)).toBe(28);
  });
});

describe("validacao previa de arquivo (a decisao final e do servidor)", () => {
  const ok = { name: "arte.png", type: "image/png", size: 100 };
  it("aceita tipo e tamanho dentro do limite", () => {
    expect(validateFileBeforeUpload(ok, limits)).toBeNull();
    expect(validateFileBeforeUpload({ name: "ROTEIRO.PDF", type: "", size: 10 }, limits)).toBeNull();
  });
  it("recusa vazio, grande, tipo desconhecido e executavel (inclusive dupla extensao)", () => {
    expect(validateFileBeforeUpload({ ...ok, size: 0 }, limits)).toMatch(/vazio/);
    expect(validateFileBeforeUpload({ ...ok, size: 2 * MB }, limits)).toMatch(/limite de 1 MB/);
    expect(validateFileBeforeUpload({ name: "nota.txt", type: "text/plain", size: 5 }, limits)).toMatch(/não permitido/);
    expect(validateFileBeforeUpload({ name: "foto.jpg.exe", type: "image/jpeg", size: 5 }, limits)).toMatch(/segurança/);
    expect(validateFileBeforeUpload({ name: "logo.SVG", type: "image/svg+xml", size: 5 }, limits)).toMatch(/segurança/);
    expect(validateFileBeforeUpload({ name: "pagina.html", type: "text/html", size: 5 }, limits)).toMatch(/segurança/);
  });
  it("respeita as categorias permitidas no ponto (gravacao so video)", () => {
    expect(validateFileBeforeUpload(ok, limits, ["VIDEO"])).toMatch(/só é aceito vídeo/);
    expect(validateFileBeforeUpload({ name: "grava.mp4", type: "video/mp4", size: 10 * MB }, limits, ["VIDEO"])).toBeNull();
    expect(validateFileBeforeUpload({ name: "grava.mp4", type: "video/mp4", size: 17 * MB }, limits, ["VIDEO"])).toMatch(/16 MB/);
  });
  it("tipo declarado vem do navegador ou da extensao", () => {
    expect(declaredMimeType({ name: "a.mov", type: "" })).toBe("video/quicktime");
    expect(declaredMimeType({ name: "a.bin", type: "application/zip" })).toBe("application/zip");
  });
  it("mensagens em pt-BR para queda e erros do servidor", () => {
    expect(uploadErrorMessage(0)).toMatch(/conexão caiu/);
    expect(uploadErrorMessage(413)).toMatch(/limite/);
    expect(uploadErrorMessage(415)).toMatch(/tipo de arquivo/);
    expect(uploadErrorMessage(429)).toMatch(/Muitos envios/);
    expect(uploadErrorMessage(503)).toMatch(/indisponível/);
    expect(uploadErrorMessage(500)).toMatch(/Não foi possível/);
  });
});
