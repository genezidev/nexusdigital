import { describe, expect, it } from "vitest";
import type { ContentStatus } from "@/generated/prisma/enums";
import { computeCycleProgress, type ProgressItem } from "@/server/domain/progress";

const counts = (status: ContentStatus, n: number, extra: Partial<ProgressItem> = {}): ProgressItem[] =>
  Array.from({ length: n }, () => ({ status, countsTowardQuota: true, isBonus: false, ...extra }));

// Exemplo de verificacao da spec 0002 (dados ficticios, cota 12).
function specExample(): ProgressItem[] {
  return [
    ...counts("PUBLICADO", 5),
    ...counts("ANALISADO", 2),
    ...counts("APROVADO", 1),
    ...counts("AGENDADO", 1),
    ...counts("AGUARDANDO_APROVACAO", 1),
    ...counts("EM_REVISAO", 1),
    ...counts("EM_PRODUCAO", 1),
    ...counts("PUBLICADO", 1, { countsTowardQuota: false }), // Story publicado
    ...counts("PUBLICADO", 1, { isBonus: true }), // bonus publicado
    ...counts("CANCELADO", 2),
  ];
}

describe("computeCycleProgress", () => {
  it("exemplo da spec: planejadas 12, produzidas 11, aprovadas 9, publicadas 7, 7 de 12 = 58%, excedente 0, 2 fora da cota", () => {
    const p = computeCycleProgress(12, specExample());
    expect(p).toMatchObject({ planned: 12, produced: 11, approved: 9, published: 7, quota: 12, hasQuota: true, percent: 58, surplus: 0 });
    expect(p.outsideQuota).toEqual({ planned: 2, produced: 2, approved: 2, published: 2 });
  });

  it("segundo cenario: 14 publicadas que contam com cota 12 trava em 100% e mostra excedente 2", () => {
    const p = computeCycleProgress(12, [...counts("PUBLICADO", 10), ...counts("ANALISADO", 4)]);
    expect(p.published).toBe(14);
    expect(p.percent).toBe(100);
    expect(p.surplus).toBe(2);
  });

  it("arredonda para BAIXO: 99,6% aparece 99% e so chega a 100% com publicadas >= cota", () => {
    expect(computeCycleProgress(1000, counts("PUBLICADO", 996)).percent).toBe(99);
    expect(computeCycleProgress(12, counts("PUBLICADO", 11)).percent).toBe(91); // 91,66...
    expect(computeCycleProgress(3, counts("PUBLICADO", 2)).percent).toBe(66); // 66,66...
    expect(computeCycleProgress(12, counts("PUBLICADO", 12)).percent).toBe(100);
    expect(computeCycleProgress(1000, counts("PUBLICADO", 999)).percent).toBe(99);
    expect(computeCycleProgress(12, []).percent).toBe(0);
  });

  it("cota zero: sem divisao, sem porcentagem e sem excedente; os contadores continuam", () => {
    const p = computeCycleProgress(0, counts("PUBLICADO", 3));
    expect(p.hasQuota).toBe(false);
    expect(p.percent).toBeNull();
    expect(p.surplus).toBe(0);
    expect(p.published).toBe(3);
    expect(Number.isNaN(p.percent as unknown as number)).toBe(false);
  });

  it("cancelados nao entram em nenhum contador, nem fora da cota", () => {
    const p = computeCycleProgress(5, [...counts("CANCELADO", 4), ...counts("CANCELADO", 3, { countsTowardQuota: false }), ...counts("CANCELADO", 2, { isBonus: true })]);
    expect(p).toMatchObject({ planned: 0, produced: 0, approved: 0, published: 0 });
    expect(p.outsideQuota).toEqual({ planned: 0, produced: 0, approved: 0, published: 0 });
  });

  it("Story (nao contavel) e bonus nunca somam ao progresso e ficam a parte, cada um pelo funil", () => {
    const p = computeCycleProgress(4, [
      ...counts("PUBLICADO", 3, { countsTowardQuota: false }),
      ...counts("ANALISADO", 2, { isBonus: true }),
      ...counts("EM_PRODUCAO", 1, { countsTowardQuota: false }),
      ...counts("PUBLICADO", 1),
    ]);
    expect(p).toMatchObject({ planned: 1, published: 1, percent: 25, surplus: 0 });
    expect(p.outsideQuota).toEqual({ planned: 6, produced: 5, approved: 5, published: 5 });
  });

  it("bonus que tambem esta marcado como contavel continua fora da cota (bonus manda)", () => {
    const p = computeCycleProgress(10, counts("PUBLICADO", 2, { isBonus: true, countsTowardQuota: true }));
    expect(p.published).toBe(0);
    expect(p.outsideQuota.published).toBe(2);
  });

  it("os quatro contadores sao cumulativos pelo funil, status por status", () => {
    const expected: Record<ContentStatus, [number, number, number, number]> = {
      PLANEJADO: [1, 0, 0, 0],
      EM_PRODUCAO: [1, 0, 0, 0],
      AGUARDANDO_APROVACAO: [1, 1, 0, 0],
      EM_REVISAO: [1, 1, 0, 0],
      APROVADO: [1, 1, 1, 0],
      AGENDADO: [1, 1, 1, 0],
      PUBLICADO: [1, 1, 1, 1],
      ANALISADO: [1, 1, 1, 1],
      CANCELADO: [0, 0, 0, 0],
    };
    for (const [status, [planned, produced, approved, published]] of Object.entries(expected) as [ContentStatus, number[]][]) {
      const p = computeCycleProgress(10, counts(status, 1));
      expect([p.planned, p.produced, p.approved, p.published], status).toEqual([planned, produced, approved, published]);
      expect(p.planned >= p.produced && p.produced >= p.approved && p.approved >= p.published).toBe(true);
    }
  });

  it("aceita contagens ja agrupadas (count) e da o mesmo resultado que linhas soltas", () => {
    const grouped: ProgressItem[] = [
      { status: "PUBLICADO", countsTowardQuota: true, isBonus: false, count: 5 },
      { status: "ANALISADO", countsTowardQuota: true, isBonus: false, count: 2 },
      { status: "CANCELADO", countsTowardQuota: true, isBonus: false, count: 9 },
    ];
    expect(computeCycleProgress(12, grouped)).toEqual(computeCycleProgress(12, [...counts("PUBLICADO", 5), ...counts("ANALISADO", 2)]));
  });

  it("recusa cota negativa ou fracionada e contagem invalida", () => {
    expect(() => computeCycleProgress(-1, [])).toThrow(RangeError);
    expect(() => computeCycleProgress(1.5, [])).toThrow(RangeError);
    expect(() => computeCycleProgress(5, [{ status: "PUBLICADO", countsTowardQuota: true, isBonus: false, count: -1 }])).toThrow(RangeError);
    expect(() => computeCycleProgress(5, [{ status: "PUBLICADO", countsTowardQuota: true, isBonus: false, count: 0.5 }])).toThrow(RangeError);
  });

  it("ciclo encerrado: mudar a classificacao depois nao altera um retrato ja calculado (e puro: mesmos dados, mesmo resultado)", () => {
    const snapshot = JSON.parse(JSON.stringify(computeCycleProgress(12, specExample())));
    const depois = specExample().map((i) => ({ ...i, countsTowardQuota: false })); // classificacao mudou depois
    expect(computeCycleProgress(12, depois).published).toBe(0);
    expect(snapshot.published).toBe(7);
    expect(snapshot.percent).toBe(58);
  });
});
