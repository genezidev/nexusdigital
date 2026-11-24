import { describe, expect, it } from "vitest";
import type { ContentStatus } from "@/generated/prisma/enums";
import {
  CONTENT_STATUSES,
  allowedContentTransitions,
  checkContentTransition,
  checkReschedule,
  classifyContentEdit,
  statusAfterVersionSent,
  type TransitionTrigger,
} from "@/server/domain/content-state";

// Tabela de verdade escrita a mao, independente de CONTENT_EDGES: o teste compara as 9 x 9 combinacoes
// com cada gatilho.
const VALID: Record<TransitionTrigger, [ContentStatus, ContentStatus][]> = {
  manual: [
    ["PLANEJADO", "EM_PRODUCAO"],
    ["APROVADO", "AGENDADO"],
    ["APROVADO", "PUBLICADO"],
    ["AGENDADO", "PUBLICADO"],
    ["PUBLICADO", "ANALISADO"],
    ["PLANEJADO", "CANCELADO"],
    ["EM_PRODUCAO", "CANCELADO"],
    ["AGUARDANDO_APROVACAO", "CANCELADO"],
    ["EM_REVISAO", "CANCELADO"],
    ["APROVADO", "CANCELADO"],
    ["AGENDADO", "CANCELADO"],
  ],
  version_sent: [
    ["EM_PRODUCAO", "AGUARDANDO_APROVACAO"],
    ["EM_REVISAO", "AGUARDANDO_APROVACAO"],
    ["APROVADO", "AGUARDANDO_APROVACAO"],
    ["AGENDADO", "AGUARDANDO_APROVACAO"],
  ],
  client_decision: [
    ["AGUARDANDO_APROVACAO", "APROVADO"],
    ["AGUARDANDO_APROVACAO", "EM_REVISAO"],
  ],
};

const REASON = "motivo com mais de dez caracteres";
const PUBLICATION = { publishedAt: new Date("2026-11-20T12:00:00Z"), publicationUrl: "https://www.instagram.com/p/exemplo-ficticio/", channel: "INSTAGRAM" as const };

describe("maquina de estados do conteudo: tabela completa origem x destino x gatilho", () => {
  for (const trigger of ["manual", "version_sent", "client_decision"] as const) {
    for (const from of CONTENT_STATUSES) {
      for (const to of CONTENT_STATUSES) {
        const valid = VALID[trigger].some(([f, t]) => f === from && t === to);
        it(`${trigger}: ${from} -> ${to} e ${valid ? "permitida" : "recusada"}`, () => {
          const r = checkContentTransition({ from, to, trigger, cancelReason: REASON, ...PUBLICATION, evidenceCount: 1 });
          expect(r.ok).toBe(valid);
          if (!r.ok) expect(r.allowed).toEqual(allowedContentTransitions(from, trigger));
        });
      }
    }
  }

  it("a lista de permitidos devolvida na recusa e exatamente a da tabela", () => {
    const r = checkContentTransition({ from: "PLANEJADO", to: "PUBLICADO", trigger: "manual" });
    expect(r).toMatchObject({ ok: false, code: "INVALID_TRANSITION", allowed: ["EM_PRODUCAO", "CANCELADO"] });
  });

  it("CANCELADO e terminal para qualquer destino e gatilho", () => {
    for (const to of CONTENT_STATUSES) {
      for (const trigger of ["manual", "version_sent", "client_decision"] as const) {
        const r = checkContentTransition({ from: "CANCELADO", to, trigger, cancelReason: REASON, ...PUBLICATION, evidenceCount: 1 });
        expect(r).toMatchObject({ ok: false, code: "TERMINAL", allowed: [] });
      }
    }
  });

  it("ANALISADO e PUBLICADO nao cancelam e nao retrocedem", () => {
    expect(checkContentTransition({ from: "PUBLICADO", to: "CANCELADO", trigger: "manual", cancelReason: REASON }).ok).toBe(false);
    expect(checkContentTransition({ from: "ANALISADO", to: "CANCELADO", trigger: "manual", cancelReason: REASON }).ok).toBe(false);
    expect(allowedContentTransitions("ANALISADO")).toEqual([]);
    expect(allowedContentTransitions("PUBLICADO")).toEqual(["ANALISADO"]);
  });

  it("a agencia nunca aprova a mao: APROVADO e EM_REVISAO so por decisao do cliente", () => {
    expect(checkContentTransition({ from: "AGUARDANDO_APROVACAO", to: "APROVADO", trigger: "manual" }).ok).toBe(false);
    expect(checkContentTransition({ from: "AGUARDANDO_APROVACAO", to: "EM_REVISAO", trigger: "manual" }).ok).toBe(false);
    expect(checkContentTransition({ from: "AGUARDANDO_APROVACAO", to: "APROVADO", trigger: "client_decision" }).ok).toBe(true);
  });

  it("cancelar sem justificativa (ou curta, ou so espacos) e recusado com o codigo certo", () => {
    for (const cancelReason of [undefined, null, "", "         ", "curta"]) {
      expect(checkContentTransition({ from: "PLANEJADO", to: "CANCELADO", trigger: "manual", cancelReason })).toMatchObject({ ok: false, code: "CANCEL_REASON_REQUIRED" });
    }
    expect(checkContentTransition({ from: "PLANEJADO", to: "CANCELADO", trigger: "manual", cancelReason: "0123456789" }).ok).toBe(true);
  });

  it("publicar exige data e (URL HTTPS ou evidencia)", () => {
    const base = { from: "APROVADO", to: "PUBLICADO", trigger: "manual" } as const;
    expect(checkContentTransition({ ...base })).toMatchObject({ ok: false, code: "PUBLICATION_DATA_REQUIRED" });
    expect(checkContentTransition({ ...base, publishedAt: PUBLICATION.publishedAt })).toMatchObject({ ok: false, code: "PUBLICATION_DATA_REQUIRED" });
    expect(checkContentTransition({ ...base, publicationUrl: PUBLICATION.publicationUrl })).toMatchObject({ ok: false, code: "PUBLICATION_DATA_REQUIRED" });
    expect(checkContentTransition({ ...base, publishedAt: PUBLICATION.publishedAt, evidenceCount: 1 }).ok).toBe(true);
    expect(checkContentTransition({ ...base, ...PUBLICATION }).ok).toBe(true);
  });

  it("a URL de publicacao precisa ser HTTPS valida; Instagram so em instagram.com", () => {
    const base = { from: "APROVADO", to: "PUBLICADO", trigger: "manual", publishedAt: PUBLICATION.publishedAt } as const;
    expect(checkContentTransition({ ...base, publicationUrl: "http://www.instagram.com/p/x/", channel: "INSTAGRAM" })).toMatchObject({ ok: false, code: "PUBLICATION_URL_INVALID" });
    expect(checkContentTransition({ ...base, publicationUrl: "https://exemplo.com.br/p/x", channel: "INSTAGRAM" })).toMatchObject({ ok: false, code: "PUBLICATION_URL_INVALID" });
    expect(checkContentTransition({ ...base, publicationUrl: "https://exemplo.com.br/p/x", channel: "YOUTUBE" }).ok).toBe(true);
    expect(checkContentTransition({ ...base, publicationUrl: "https://127.0.0.1/x", channel: "YOUTUBE" })).toMatchObject({ ok: false, code: "PUBLICATION_URL_INVALID" });
  });

  it("percorre PLANEJADO ate ANALISADO", () => {
    const path: [ContentStatus, ContentStatus, TransitionTrigger][] = [
      ["PLANEJADO", "EM_PRODUCAO", "manual"],
      ["EM_PRODUCAO", "AGUARDANDO_APROVACAO", "version_sent"],
      ["AGUARDANDO_APROVACAO", "EM_REVISAO", "client_decision"],
      ["EM_REVISAO", "AGUARDANDO_APROVACAO", "version_sent"],
      ["AGUARDANDO_APROVACAO", "APROVADO", "client_decision"],
      ["APROVADO", "AGENDADO", "manual"],
      ["AGENDADO", "PUBLICADO", "manual"],
      ["PUBLICADO", "ANALISADO", "manual"],
    ];
    for (const [from, to, trigger] of path) {
      expect(checkContentTransition({ from, to, trigger, ...PUBLICATION }).ok, `${from} -> ${to}`).toBe(true);
    }
  });
});

describe("edicao: o que invalida a aprovacao", () => {
  const MATERIAL = ["caption", "cta", "hashtags", "briefing", "assets", "assetOrder", "format", "channel"];
  const PLANNING = ["title", "description", "plannedOn", "assigneeId", "assigneeVisibleToClient", "pillar", "objective", "internalNotes"];

  it("cada campo de material em conteudo APROVADO ou AGENDADO exige nova versao enviada, invalida e volta a fila", () => {
    for (const status of ["APROVADO", "AGENDADO"] as const) {
      for (const field of MATERIAL) {
        expect(classifyContentEdit(status, [field]), `${status}/${field}`).toEqual({
          ok: true,
          kind: "material",
          mode: "new_version_sent",
          invalidatesApproval: true,
          nextStatus: "AGUARDANDO_APROVACAO",
        });
      }
    }
  });

  it("planejamento puro (data, responsavel, pilar, notas) nao invalida em nenhum estado nao terminal", () => {
    for (const status of CONTENT_STATUSES.filter((s) => s !== "CANCELADO")) {
      for (const field of PLANNING) expect(classifyContentEdit(status, [field]), `${status}/${field}`).toEqual({ ok: true, kind: "planning" });
    }
  });

  it("misturar planejamento e material conta como material", () => {
    expect(classifyContentEdit("APROVADO", ["title", "caption"])).toMatchObject({ ok: true, kind: "material", invalidatesApproval: true });
  });

  it("PUBLICADO e ANALISADO nao tem o material editado (correcao entra como comentario); planejamento pode", () => {
    for (const status of ["PUBLICADO", "ANALISADO"] as const) {
      for (const field of MATERIAL) expect(classifyContentEdit(status, [field])).toMatchObject({ ok: false, code: "MATERIAL_LOCKED" });
      expect(classifyContentEdit(status, ["internalNotes"]).ok).toBe(true);
    }
  });

  it("CANCELADO nao e editado de forma alguma", () => {
    expect(classifyContentEdit("CANCELADO", ["internalNotes"])).toMatchObject({ ok: false, code: "TERMINAL" });
    expect(classifyContentEdit("CANCELADO", ["caption"])).toMatchObject({ ok: false, code: "TERMINAL" });
  });

  it("em producao, planejado ou em revisao edita-se o rascunho, sem mudar o status", () => {
    for (const status of ["PLANEJADO", "EM_PRODUCAO", "EM_REVISAO"] as const) {
      expect(classifyContentEdit(status, ["caption"])).toEqual({ ok: true, kind: "material", mode: "edit_draft", invalidatesApproval: false, nextStatus: status });
    }
  });

  it("aguardando aprovacao: material gera nova versao (a enviada e imutavel), sem aprovacao a invalidar", () => {
    expect(classifyContentEdit("AGUARDANDO_APROVACAO", ["cta"])).toEqual({ ok: true, kind: "material", mode: "new_version_sent", invalidatesApproval: false, nextStatus: "AGUARDANDO_APROVACAO" });
  });

  it("campo desconhecido e recusado (nega por padrao)", () => {
    expect(classifyContentEdit("PLANEJADO", ["status"])).toMatchObject({ ok: false, code: "UNKNOWN_FIELD" });
    expect(classifyContentEdit("PLANEJADO", ["countsTowardQuota"])).toMatchObject({ ok: false, code: "UNKNOWN_FIELD" });
  });

  it("status depois de enviar versao", () => {
    expect(statusAfterVersionSent("EM_PRODUCAO")).toBe("AGUARDANDO_APROVACAO");
    expect(statusAfterVersionSent("EM_REVISAO")).toBe("AGUARDANDO_APROVACAO");
    expect(statusAfterVersionSent("APROVADO")).toBe("AGUARDANDO_APROVACAO");
    expect(statusAfterVersionSent("AGENDADO")).toBe("AGUARDANDO_APROVACAO");
    expect(statusAfterVersionSent("AGUARDANDO_APROVACAO")).toBe("AGUARDANDO_APROVACAO");
    for (const s of ["PLANEJADO", "PUBLICADO", "ANALISADO", "CANCELADO"] as const) expect(statusAfterVersionSent(s)).toBeNull();
  });
});

describe("reagendar no calendario", () => {
  const base = { cycleYear: 2026, cycleMonth: 11, today: "2026-11-24" };
  it("dentro do mes do ciclo, ok; fora do mes, recusado", () => {
    expect(checkReschedule({ ...base, status: "PLANEJADO", newDate: "2026-11-30" }).ok).toBe(true);
    expect(checkReschedule({ ...base, status: "PLANEJADO", newDate: "2026-12-01" })).toMatchObject({ ok: false, code: "OUTSIDE_CYCLE_MONTH" });
    expect(checkReschedule({ ...base, status: "PLANEJADO", newDate: "2026-10-31" })).toMatchObject({ ok: false, code: "OUTSIDE_CYCLE_MONTH" });
    expect(checkReschedule({ ...base, status: "PLANEJADO", newDate: "2025-11-10" })).toMatchObject({ ok: false, code: "OUTSIDE_CYCLE_MONTH" });
  });
  it("peca cancelada nao reagenda", () => {
    expect(checkReschedule({ ...base, status: "CANCELADO", newDate: "2026-11-30" })).toMatchObject({ ok: false, code: "CANCELLED" });
  });
  it("peca ja publicada nao vai para o passado", () => {
    expect(checkReschedule({ ...base, status: "PUBLICADO", newDate: "2026-11-10" })).toMatchObject({ ok: false, code: "PUBLISHED_IN_PAST" });
    expect(checkReschedule({ ...base, status: "ANALISADO", newDate: "2026-11-23" })).toMatchObject({ ok: false, code: "PUBLISHED_IN_PAST" });
    expect(checkReschedule({ ...base, status: "PUBLICADO", newDate: "2026-11-24" }).ok).toBe(true);
  });
  it("data impossivel ou mal formada", () => {
    for (const newDate of ["2026-02-30", "2026-13-01", "26-11-10", "", "2026-11-1", "hoje"]) {
      expect(checkReschedule({ ...base, status: "PLANEJADO", newDate })).toMatchObject({ ok: false, code: "INVALID_DATE" });
    }
    expect(checkReschedule({ cycleYear: 2028, cycleMonth: 2, today: "2028-02-01", status: "PLANEJADO", newDate: "2028-02-29" }).ok).toBe(true); // bissexto
  });
});
