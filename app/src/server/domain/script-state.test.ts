import { describe, expect, it } from "vitest";
import type { ScriptStatus } from "@/generated/prisma/enums";
import {
  SCRIPT_STATUSES,
  allowedScriptTransitions,
  checkScriptTransition,
  isScriptEditable,
  isScriptVisibleToClient,
} from "@/server/domain/script-state";

// Tabela escrita a mao, independente de SCRIPT_EDGES.
const FORWARD: [ScriptStatus, ScriptStatus][] = [
  ["RASCUNHO", "ENVIADO"],
  ["ENVIADO", "AGUARDANDO_GRAVACAO"],
  ["AGUARDANDO_GRAVACAO", "GRAVACAO_RECEBIDA"],
  ["GRAVACAO_RECEBIDA", "EM_EDICAO"],
  ["EM_EDICAO", "AGUARDANDO_APROVACAO"],
  ["AGUARDANDO_APROVACAO", "FINALIZADO"],
  ["FINALIZADO", "PUBLICADO"],
];
const RERECORD: [ScriptStatus, ScriptStatus][] = [
  ["GRAVACAO_RECEBIDA", "AGUARDANDO_GRAVACAO"],
  ["EM_EDICAO", "AGUARDANDO_GRAVACAO"],
];

describe("maquina de estados do roteiro: tabela completa origem x destino", () => {
  for (const from of SCRIPT_STATUSES) {
    for (const to of SCRIPT_STATUSES) {
      const fwd = FORWARD.some(([f, t]) => f === from && t === to);
      const rer = RERECORD.some(([f, t]) => f === from && t === to);
      it(`${from} -> ${to}: fluxo normal ${fwd ? "permitido" : "recusado"}, regravacao ${rer ? "permitida" : "recusada"}`, () => {
        const normal = checkScriptTransition({ from, to, hasReceivedRecording: true });
        expect(normal.ok).toBe(fwd);
        const regrav = checkScriptTransition({ from, to, rerecording: true, justification: "a luz estava errada na cena 2" });
        expect(regrav.ok).toBe(rer);
        if (!normal.ok) expect(normal.allowed).toEqual(allowedScriptTransitions(from, false));
      });
    }
  }

  it("pedido de regravacao exige justificativa", () => {
    for (const justification of [undefined, null, "", "  curta ", "123456789"]) {
      expect(checkScriptTransition({ from: "GRAVACAO_RECEBIDA", to: "AGUARDANDO_GRAVACAO", rerecording: true, justification })).toMatchObject({ ok: false, code: "REASON_REQUIRED" });
    }
  });

  it("regravacao nao e atalho de fluxo normal e vice-versa", () => {
    expect(checkScriptTransition({ from: "EM_EDICAO", to: "AGUARDANDO_GRAVACAO" }).ok).toBe(false);
    expect(checkScriptTransition({ from: "RASCUNHO", to: "ENVIADO", rerecording: true, justification: "motivo bem longo aqui" }).ok).toBe(false);
  });

  it("GRAVACAO_RECEBIDA exige uma gravacao confirmada", () => {
    expect(checkScriptTransition({ from: "AGUARDANDO_GRAVACAO", to: "GRAVACAO_RECEBIDA" })).toMatchObject({ ok: false, code: "RECORDING_NOT_RECEIVED" });
    expect(checkScriptTransition({ from: "AGUARDANDO_GRAVACAO", to: "GRAVACAO_RECEBIDA", hasReceivedRecording: false })).toMatchObject({ ok: false, code: "RECORDING_NOT_RECEIVED" });
    expect(checkScriptTransition({ from: "AGUARDANDO_GRAVACAO", to: "GRAVACAO_RECEBIDA", hasReceivedRecording: true }).ok).toBe(true);
  });

  it("ligado a conteudo: AGUARDANDO_APROVACAO, FINALIZADO e PUBLICADO exigem o estado do conteudo", () => {
    expect(checkScriptTransition({ from: "EM_EDICAO", to: "AGUARDANDO_APROVACAO", linkedContentStatus: "EM_PRODUCAO" })).toMatchObject({ ok: false, code: "LINKED_CONTENT_STATE" });
    expect(checkScriptTransition({ from: "EM_EDICAO", to: "AGUARDANDO_APROVACAO", linkedContentStatus: "AGUARDANDO_APROVACAO" }).ok).toBe(true);
    for (const s of ["PLANEJADO", "EM_PRODUCAO", "AGUARDANDO_APROVACAO", "EM_REVISAO", "CANCELADO"] as const) {
      expect(checkScriptTransition({ from: "AGUARDANDO_APROVACAO", to: "FINALIZADO", linkedContentStatus: s }).ok, `FINALIZADO com ${s}`).toBe(false);
    }
    for (const s of ["APROVADO", "AGENDADO", "PUBLICADO", "ANALISADO"] as const) {
      expect(checkScriptTransition({ from: "AGUARDANDO_APROVACAO", to: "FINALIZADO", linkedContentStatus: s }).ok, `FINALIZADO com ${s}`).toBe(true);
    }
    expect(checkScriptTransition({ from: "FINALIZADO", to: "PUBLICADO", linkedContentStatus: "APROVADO" })).toMatchObject({ ok: false, code: "LINKED_CONTENT_STATE" });
    expect(checkScriptTransition({ from: "FINALIZADO", to: "PUBLICADO", linkedContentStatus: "PUBLICADO" }).ok).toBe(true);
  });

  it("sem conteudo ligado o status e manual (sem exigencia do conteudo)", () => {
    expect(checkScriptTransition({ from: "EM_EDICAO", to: "AGUARDANDO_APROVACAO", linkedContentStatus: null }).ok).toBe(true);
    expect(checkScriptTransition({ from: "FINALIZADO", to: "PUBLICADO" }).ok).toBe(true);
  });

  it("visibilidade e edicao por status", () => {
    expect(isScriptVisibleToClient("RASCUNHO")).toBe(false);
    for (const s of SCRIPT_STATUSES.filter((x) => x !== "RASCUNHO")) expect(isScriptVisibleToClient(s)).toBe(true);
    expect(isScriptEditable("RASCUNHO")).toBe(true);
    expect(isScriptEditable("ENVIADO")).toBe(false);
  });
});
