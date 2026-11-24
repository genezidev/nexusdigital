import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime } from "@/lib/formatting/date";

describe("datas DD/MM/AAAA no fuso do cliente", () => {
  it("formata no fuso padrao America/Maceio (UTC-3)", () => {
    expect(formatDate("2026-11-24T02:30:00Z")).toBe("23/11/2026");
    expect(formatDateTime("2026-11-24T15:05:00Z")).toBe("24/11/2026 12:05");
  });
  it("respeita outro fuso e mostra N/D para data invalida", () => {
    expect(formatDateTime("2026-11-24T15:05:00Z", "America/Manaus")).toBe("24/11/2026 11:05");
    expect(formatDate("lixo")).toBe("N/D");
  });
});
