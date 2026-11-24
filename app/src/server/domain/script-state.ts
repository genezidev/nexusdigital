import type { ContentStatus, ScriptStatus } from "@/generated/prisma/enums";
import { MIN_REASON_LENGTH } from "@/server/domain/content-state";

// Maquina de estados do roteiro (spec 0002, "Fluxo de status do roteiro"). Pura (D-0013).

export const SCRIPT_STATUSES: readonly ScriptStatus[] = [
  "RASCUNHO",
  "ENVIADO",
  "AGUARDANDO_GRAVACAO",
  "GRAVACAO_RECEBIDA",
  "EM_EDICAO",
  "AGUARDANDO_APROVACAO",
  "FINALIZADO",
  "PUBLICADO",
];

interface Edge {
  from: ScriptStatus;
  to: ScriptStatus;
  /** "rerecording" e o pedido de regravacao (justificativa obrigatoria); os demais seguem o fluxo normal. */
  kind: "forward" | "rerecording";
}

export const SCRIPT_EDGES: readonly Edge[] = [
  { from: "RASCUNHO", to: "ENVIADO", kind: "forward" },
  { from: "ENVIADO", to: "AGUARDANDO_GRAVACAO", kind: "forward" },
  { from: "AGUARDANDO_GRAVACAO", to: "GRAVACAO_RECEBIDA", kind: "forward" },
  { from: "GRAVACAO_RECEBIDA", to: "EM_EDICAO", kind: "forward" },
  { from: "EM_EDICAO", to: "AGUARDANDO_APROVACAO", kind: "forward" },
  { from: "AGUARDANDO_APROVACAO", to: "FINALIZADO", kind: "forward" },
  { from: "FINALIZADO", to: "PUBLICADO", kind: "forward" },
  { from: "GRAVACAO_RECEBIDA", to: "AGUARDANDO_GRAVACAO", kind: "rerecording" },
  { from: "EM_EDICAO", to: "AGUARDANDO_GRAVACAO", kind: "rerecording" },
];

/** Conteudo ligado: o que o roteiro exige dele para cada estado (a aprovacao do video e a do conteudo). */
const LINKED_CONTENT_REQUIRED: Partial<Record<ScriptStatus, readonly ContentStatus[]>> = {
  AGUARDANDO_APROVACAO: ["AGUARDANDO_APROVACAO"],
  FINALIZADO: ["APROVADO", "AGENDADO", "PUBLICADO", "ANALISADO"],
  PUBLICADO: ["PUBLICADO", "ANALISADO"],
};

export type ScriptRefusal = "INVALID_TRANSITION" | "REASON_REQUIRED" | "RECORDING_NOT_RECEIVED" | "LINKED_CONTENT_STATE";

export type ScriptTransitionResult = { ok: true } | { ok: false; code: ScriptRefusal; message: string; allowed: ScriptStatus[] };

export interface ScriptTransitionInput {
  from: ScriptStatus;
  to: ScriptStatus;
  /** Marca o pedido de regravacao: so as arestas "rerecording" valem e a justificativa e obrigatoria. */
  rerecording?: boolean;
  justification?: string | null;
  /** Status do conteudo ligado ao roteiro, ou null/undefined quando nao ha ligacao (status manual). */
  linkedContentStatus?: ContentStatus | null;
  /** Existe gravacao confirmada (RECEBIDA)? Exigido para entrar em GRAVACAO_RECEBIDA. */
  hasReceivedRecording?: boolean;
}

export function allowedScriptTransitions(from: ScriptStatus, rerecording = false): ScriptStatus[] {
  return SCRIPT_EDGES.filter((e) => e.from === from && (e.kind === "rerecording") === rerecording).map((e) => e.to);
}

export function checkScriptTransition(input: ScriptTransitionInput): ScriptTransitionResult {
  const rerecording = input.rerecording === true;
  const allowed = allowedScriptTransitions(input.from, rerecording);
  const edge = SCRIPT_EDGES.find((e) => e.from === input.from && e.to === input.to && (e.kind === "rerecording") === rerecording);
  if (!edge) return { ok: false, code: "INVALID_TRANSITION", message: `Transicao ${input.from} -> ${input.to} nao permitida.`, allowed };
  if (rerecording && (input.justification ?? "").trim().length < MIN_REASON_LENGTH) {
    return { ok: false, code: "REASON_REQUIRED", message: `O pedido de regravacao exige justificativa de pelo menos ${MIN_REASON_LENGTH} caracteres.`, allowed };
  }
  if (input.to === "GRAVACAO_RECEBIDA" && input.hasReceivedRecording !== true) {
    return { ok: false, code: "RECORDING_NOT_RECEIVED", message: "Confirme uma gravacao recebida antes.", allowed };
  }
  const required = LINKED_CONTENT_REQUIRED[input.to];
  if (required && input.linkedContentStatus && !required.includes(input.linkedContentStatus)) {
    return { ok: false, code: "LINKED_CONTENT_STATE", message: `O conteudo ligado precisa estar em ${required.join(" ou ")}.`, allowed };
  }
  return { ok: true };
}

/** O cliente ve o roteiro a partir de ENVIADO; RASCUNHO e interno. */
export function isScriptVisibleToClient(status: ScriptStatus): boolean {
  return status !== "RASCUNHO";
}

/** Cenas, instrucoes e anexos so se editam enquanto o roteiro e rascunho. */
export function isScriptEditable(status: ScriptStatus): boolean {
  return status === "RASCUNHO";
}
