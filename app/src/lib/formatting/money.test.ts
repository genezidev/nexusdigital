import { describe, expect, it } from "vitest";
import { formatCents, percentChange } from "./money";

const normalize = (s: string) => s.replace(/ /g, " ");

describe("formatCents", () => {
  it("formata centavos em reais", () => {
    expect(normalize(formatCents(120000))).toBe("R$ 1.200,00");
  });
  it("rejeita valor não inteiro", () => {
    expect(() => formatCents(10.5)).toThrow(RangeError);
  });
});

describe("percentChange", () => {
  it("calcula a variação", () => {
    expect(percentChange(150, 100)).toBe(50);
  });
  it("retorna N/D quando o anterior é zero ou ausente", () => {
    expect(percentChange(10, 0)).toBeNull();
  });
});
