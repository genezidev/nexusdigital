import { describe, expect, it } from "vitest";
import { contentForm, cycleForm, parseHashtags, parseLines, parseMoneyToCents, planForm, quotaForm, reasonForm } from "@/lib/forms-fase2";

describe("dinheiro em pt-BR vira centavos inteiros", () => {
  it.each([
    ["1.200,00", 120000],
    ["1200", 120000],
    ["1200,5", 120050],
    ["R$ 89,90", 8990],
    ["0,99", 99],
    ["1.234.567,89", 123456789],
  ])("aceita %s", (input, cents) => expect(parseMoneyToCents(input)).toBe(cents));
  it.each(["", "abc", "12,345", "1,2,3", "-5", "1.20", "R$", "1200.00"])("recusa %j", (input) => expect(parseMoneyToCents(input)).toBeNull());
});

describe("listas digitadas", () => {
  it("hashtags separadas por espaco, virgula ou ponto e virgula, sem repetir", () => {
    expect(parseHashtags("#oferta  #verao, #oferta;#nexo")).toEqual(["#oferta", "#verao", "#nexo"]);
    expect(parseHashtags("   ")).toEqual([]);
  });
  it("linhas nao vazias", () => expect(parseLines("a\n\n  b \r\nc")).toEqual(["a", "b", "c"]));
});

describe("formularios", () => {
  const plan = { code: "essencial", name: "Essencial (exemplo)", amount: "1.200,00", quota: "12", revisions: "2", deadline: "3", scope: "Posts", exclusions: "" };
  it("plano converte texto em numeros e valor em centavos", () => {
    const r = planForm.safeParse(plan);
    expect(r.success && r.data).toMatchObject({ amount: 120000, quota: 12, revisions: 2, deadline: 3 });
  });
  it("plano mostra o erro junto do campo certo", () => {
    const r = planForm.safeParse({ ...plan, code: "Essencial!", amount: "abc", quota: "", scope: "" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path[0]);
      expect(paths).toEqual(expect.arrayContaining(["code", "amount", "quota", "scope"]));
    }
  });
  it("justificativa exige pelo menos 10 caracteres (como o servidor)", () => {
    expect(reasonForm().safeParse({ reason: "curto" }).success).toBe(false);
    expect(reasonForm().safeParse({ reason: "motivo completo" }).success).toBe(true);
    expect(reasonForm(1).safeParse({ reason: "x" }).success).toBe(true);
  });
  it("cota do ciclo: vazio vale 'cota cheia da assinatura'; numero e validado", () => {
    expect(cycleForm.safeParse({ year: "2026", month: "11", quota: "", reason: "" })).toMatchObject({ success: true, data: { quota: undefined, month: 11 } });
    expect(cycleForm.safeParse({ year: "2026", month: "13", quota: "", reason: "" }).success).toBe(false);
    expect(quotaForm.safeParse({ quota: "10", reason: "ajuste combinado com o cliente" }).success).toBe(true);
    expect(quotaForm.safeParse({ quota: "-1", reason: "ajuste combinado com o cliente" }).success).toBe(false);
  });
  it("conteudo exige data existente (31/02 nao passa)", () => {
    const base = { cycleId: "3f2b6c1e-8a53-4c3a-9a53-6d2b8d7d0a11", title: "Post", format: "ARTE", channel: "INSTAGRAM", pillar: "", objective: "", description: "", assigneeId: "", countsTowardQuota: true };
    expect(contentForm.safeParse({ ...base, plannedOn: "2026-11-30" }).success).toBe(true);
    expect(contentForm.safeParse({ ...base, plannedOn: "2026-02-31" }).success).toBe(false);
  });
});
