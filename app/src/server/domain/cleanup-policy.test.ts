import { describe, expect, it } from "vitest";
import { assessOrphans, CleanupAbortedError, decideInstallBinding, DEFAULT_MAX_ORPHAN_RATIO, DEFAULT_MAX_ORPHANS, MIN_CLEANUP_HOURS, resolveCleanupLimits } from "@/server/domain/cleanup-policy";

// M-A: regras puras da limpeza de arquivos (o que fazer com banco errado, backup antigo, pasta de outra instalacao).
const limits = { maxOrphans: DEFAULT_MAX_ORPHANS, maxOrphanRatio: DEFAULT_MAX_ORPHAN_RATIO };

describe("opcoes da limpeza", () => {
  it("padroes: 24 h, retencao de 30 dias, teto de 20 orfaos e 10%", () => {
    expect(resolveCleanupLimits({})).toEqual({ maxAgeHours: 24, trashRetentionDays: 30, maxOrphans: 20, maxOrphanRatio: 0.1 });
  });

  it("minimo de 1 hora (0, fracao, negativo e NaN sao recusados)", () => {
    expect(MIN_CLEANUP_HOURS).toBe(1);
    expect(resolveCleanupLimits({ maxAgeHours: 1 }).maxAgeHours).toBe(1);
    for (const bad of [0, 0.99, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => resolveCleanupLimits({ maxAgeHours: bad }), String(bad)).toThrow(CleanupAbortedError);
    }
  });

  it("retencao, teto e proporcao fora do intervalo sao recusados", () => {
    expect(() => resolveCleanupLimits({ trashRetentionDays: 0 })).toThrow(/1 dia/);
    expect(() => resolveCleanupLimits({ maxOrphans: -1 })).toThrow(CleanupAbortedError);
    expect(() => resolveCleanupLimits({ maxOrphans: 1.5 })).toThrow(CleanupAbortedError);
    expect(() => resolveCleanupLimits({ maxOrphanRatio: 1.1 })).toThrow(CleanupAbortedError);
    expect(() => resolveCleanupLimits({ maxOrphanRatio: -0.1 })).toThrow(CleanupAbortedError);
    expect(resolveCleanupLimits({ maxOrphans: 0, maxOrphanRatio: 0 })).toMatchObject({ maxOrphans: 0, maxOrphanRatio: 0 });
  });
});

describe("identificador da instalacao (banco x pasta)", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  it("iguais: segue", () => {
    expect(decideInstallBinding(A, A, false)).toEqual({ action: "ok" });
    expect(decideInstallBinding(A, A, true)).toEqual({ action: "ok" });
  });

  it("diferentes: aborta SEMPRE, com ou sem flag, e a mensagem nao traz os identificadores", () => {
    for (const allow of [false, true]) {
      const d = decideInstallBinding(A, B, allow);
      expect(d).toMatchObject({ action: "abort", code: "INSTALL_ID_MISMATCH" });
      expect(JSON.stringify(d)).not.toContain(A);
      expect(JSON.stringify(d)).not.toContain(B);
    }
  });

  it("falta um dos lados sem flag: aborta e nunca cria em silencio", () => {
    expect(decideInstallBinding(A, null, false)).toMatchObject({ action: "abort", code: "INSTALL_ID_MISSING" });
    expect(decideInstallBinding(null, A, false)).toMatchObject({ action: "abort", code: "INSTALL_ID_MISSING" });
    expect(decideInstallBinding(null, null, false)).toMatchObject({ action: "abort", code: "INSTALL_ID_MISSING" });
  });

  it("falta um dos lados COM flag explicita: cria so o que falta, copiando o que existe", () => {
    expect(decideInstallBinding(A, null, true)).toEqual({ action: "write-file", id: A });
    expect(decideInstallBinding(null, A, true)).toEqual({ action: "write-db", id: A });
    expect(decideInstallBinding(null, null, true)).toEqual({ action: "create-both" });
  });
});

describe("quantos orfaos sao plausiveis", () => {
  it("zero orfao nunca aborta (nem com o banco sem DISPONIVEL: pode ser instalacao nova)", () => {
    expect(assessOrphans({ totalObjects: 500, orphans: 0, availableInDb: 0 }, limits)).toBeNull();
  });

  it("poucos orfaos entre poucos objetos passam (a proporcao so vale com 10 objetos ou mais)", () => {
    expect(assessOrphans({ totalObjects: 3, orphans: 2, availableInDb: 1 }, limits)).toBeNull();
    expect(assessOrphans({ totalObjects: 9, orphans: 5, availableInDb: 4 }, limits)).toBeNull();
  });

  it("acima do teto absoluto aborta", () => {
    expect(assessOrphans({ totalObjects: 10_000, orphans: 20, availableInDb: 9_980 }, limits)).toBeNull();
    expect(assessOrphans({ totalObjects: 10_000, orphans: 21, availableInDb: 9_979 }, limits)).toMatchObject({ code: "TOO_MANY_ORPHANS" });
    expect(assessOrphans({ totalObjects: 5, orphans: 1, availableInDb: 4 }, { maxOrphans: 0, maxOrphanRatio: 1 })).toMatchObject({ code: "TOO_MANY_ORPHANS" });
  });

  it("acima da proporcao aborta (10 objetos ou mais)", () => {
    expect(assessOrphans({ totalObjects: 100, orphans: 10, availableInDb: 90 }, limits)).toBeNull(); // exatamente 10%
    expect(assessOrphans({ totalObjects: 100, orphans: 11, availableInDb: 89 }, limits)).toMatchObject({ code: "ORPHAN_RATIO" });
    expect(assessOrphans({ totalObjects: 10, orphans: 2, availableInDb: 8 }, limits)).toMatchObject({ code: "ORPHAN_RATIO" });
    expect(assessOrphans({ totalObjects: 100, orphans: 11, availableInDb: 89 }, { maxOrphans: 20, maxOrphanRatio: 0.2 })).toBeNull();
  });

  it("banco sem nenhum DISPONIVEL e pasta com muitos objetos: aborta antes de qualquer outra conta", () => {
    expect(assessOrphans({ totalObjects: 10, orphans: 1, availableInDb: 0 }, limits)).toMatchObject({ code: "NO_AVAILABLE_ASSETS" });
    expect(assessOrphans({ totalObjects: 9, orphans: 1, availableInDb: 0 }, limits)).toBeNull();
    expect(assessOrphans({ totalObjects: 10, orphans: 1, availableInDb: 1 }, { maxOrphans: 20, maxOrphanRatio: 1 })).toBeNull();
  });

  it("a mensagem nunca carrega caminho, chave ou identificador", () => {
    const e = assessOrphans({ totalObjects: 100, orphans: 50, availableInDb: 50 }, limits)!;
    expect(e.message).not.toMatch(/clients\/|[0-9a-f]{8}-[0-9a-f]{4}/);
    expect(e.message).toMatch(/Nada foi movido/);
  });
});
