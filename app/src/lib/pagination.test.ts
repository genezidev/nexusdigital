import { describe, expect, it } from "vitest";
import { parsePageParams, totalPages } from "@/lib/pagination";

describe("paginacao", () => {
  it("le page, pageSize e q com limites seguros", () => {
    expect(parsePageParams(new URLSearchParams("page=3&pageSize=20&q=%20ana%20"))).toEqual({ page: 3, pageSize: 20, q: "ana" });
  });
  it("valor invalido cai no padrao e nunca estoura", () => {
    expect(parsePageParams({ page: "-4", pageSize: "9999", q: "" })).toEqual({ page: 1, pageSize: 10, q: undefined });
    expect(parsePageParams({ page: "abc" }).page).toBe(1);
    expect(parsePageParams({ page: ["2", "3"] }).page).toBe(2);
    expect(parsePageParams({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
  it("conta paginas com no minimo uma", () => {
    expect(totalPages(0, 10)).toBe(1);
    expect(totalPages(21, 10)).toBe(3);
  });
});
