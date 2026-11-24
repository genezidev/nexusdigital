import { describe, expect, it } from "vitest";
import { slugify } from "@/server/services/clients";

describe("slugify", () => {
  it("remove acentos, normaliza e limita o tamanho", () => {
    expect(slugify("Padaria São João & Filhos Ltda.")).toBe("padaria-sao-joao-filhos-ltda");
    expect(slugify("  ---  ")).toBe("cliente");
    expect(slugify("a".repeat(100))).toHaveLength(40);
  });
});
