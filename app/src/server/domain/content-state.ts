import type { Channel, ContentStatus } from "@/generated/prisma/enums";
import { INSTAGRAM_DOMAINS, validateHttpsLink } from "@/server/domain/external-link";

// Maquina de estados do conteudo: UMA funcao decide o que e permitido; telas e API so a chamam
// (spec 0002, "Fluxo de status do conteudo"). Pura: sem banco e sem relogio (D-0013).

export const CONTENT_STATUSES: readonly ContentStatus[] = [
  "PLANEJADO",
  "EM_PRODUCAO",
  "AGUARDANDO_APROVACAO",
  "EM_REVISAO",
  "APROVADO",
  "AGENDADO",
  "PUBLICADO",
  "ANALISADO",
  "CANCELADO",
];

/** Quem provoca a mudanca: a agencia a mao, o envio de uma versao, ou a decisao do cliente. */
export type TransitionTrigger = "manual" | "version_sent" | "client_decision";

interface Edge {
  from: ContentStatus;
  to: ContentStatus;
  trigger: TransitionTrigger;
}

const CANCELLABLE: readonly ContentStatus[] = ["PLANEJADO", "EM_PRODUCAO", "AGUARDANDO_APROVACAO", "EM_REVISAO", "APROVADO", "AGENDADO"];

export const CONTENT_EDGES: readonly Edge[] = [
  { from: "PLANEJADO", to: "EM_PRODUCAO", trigger: "manual" },
  { from: "EM_PRODUCAO", to: "AGUARDANDO_APROVACAO", trigger: "version_sent" },
  { from: "AGUARDANDO_APROVACAO", to: "APROVADO", trigger: "client_decision" },
  { from: "AGUARDANDO_APROVACAO", to: "EM_REVISAO", trigger: "client_decision" },
  { from: "EM_REVISAO", to: "AGUARDANDO_APROVACAO", trigger: "version_sent" },
  { from: "APROVADO", to: "AGENDADO", trigger: "manual" },
  { from: "APROVADO", to: "PUBLICADO", trigger: "manual" },
  { from: "AGENDADO", to: "PUBLICADO", trigger: "manual" },
  // Invalidacao da aprovacao: so por nova versao (nunca por mudanca manual de status).
  { from: "APROVADO", to: "AGUARDANDO_APROVACAO", trigger: "version_sent" },
  { from: "AGENDADO", to: "AGUARDANDO_APROVACAO", trigger: "version_sent" },
  { from: "PUBLICADO", to: "ANALISADO", trigger: "manual" },
  ...CANCELLABLE.map((from): Edge => ({ from, to: "CANCELADO", trigger: "manual" })),
];

export type TransitionRefusal =
  | "INVALID_TRANSITION"
  | "TERMINAL"
  | "CANCEL_REASON_REQUIRED"
  | "PUBLICATION_DATA_REQUIRED"
  | "PUBLICATION_URL_INVALID";

export type TransitionResult = { ok: true } | { ok: false; code: TransitionRefusal; message: string; allowed: ContentStatus[] };

export interface TransitionInput {
  from: ContentStatus;
  to: ContentStatus;
  trigger: TransitionTrigger;
  cancelReason?: string | null;
  publishedAt?: Date | null;
  publicationUrl?: string | null;
  /** Quantos arquivos de evidencia de publicacao existem (asset_links EVIDENCIA). */
  evidenceCount?: number;
  channel?: Channel;
}

export const MIN_REASON_LENGTH = 10;

/** Estados para os quais `from` pode ir pelo gatilho dado (a lista devolvida ao usuario no 422). */
export function allowedContentTransitions(from: ContentStatus, trigger: TransitionTrigger = "manual"): ContentStatus[] {
  return CONTENT_EDGES.filter((e) => e.from === from && e.trigger === trigger).map((e) => e.to);
}

export function isTerminalContentStatus(status: ContentStatus): boolean {
  return status === "CANCELADO" || status === "ANALISADO";
}

export function checkContentTransition(input: TransitionInput): TransitionResult {
  const allowed = allowedContentTransitions(input.from, input.trigger);
  if (input.from === "CANCELADO") {
    return { ok: false, code: "TERMINAL", message: "Conteudo cancelado e terminal.", allowed: [] };
  }
  const edge = CONTENT_EDGES.find((e) => e.from === input.from && e.to === input.to && e.trigger === input.trigger);
  if (!edge) {
    return { ok: false, code: "INVALID_TRANSITION", message: `Transicao ${input.from} -> ${input.to} nao permitida.`, allowed };
  }
  if (input.to === "CANCELADO" && (input.cancelReason ?? "").trim().length < MIN_REASON_LENGTH) {
    return { ok: false, code: "CANCEL_REASON_REQUIRED", message: `Cancelar exige justificativa de pelo menos ${MIN_REASON_LENGTH} caracteres.`, allowed };
  }
  if (input.to === "PUBLICADO") {
    const url = input.publicationUrl?.trim() ?? "";
    if (!input.publishedAt || (url === "" && (input.evidenceCount ?? 0) < 1)) {
      return { ok: false, code: "PUBLICATION_DATA_REQUIRED", message: "Publicar exige a data de publicacao e a URL HTTPS ou um arquivo de evidencia.", allowed };
    }
    if (url !== "") {
      const link = validateHttpsLink(url, input.channel === "INSTAGRAM" ? { allowedDomains: INSTAGRAM_DOMAINS } : {});
      if (!link.ok) {
        return { ok: false, code: "PUBLICATION_URL_INVALID", message: "A URL de publicacao precisa ser HTTPS valida (Instagram: instagram.com).", allowed };
      }
    }
  }
  return { ok: true };
}

// ---------- Edicao: o que invalida a aprovacao ----------

/** Muda o que o cliente aprovou (versao, arquivos, formato, canal): exige NOVA versao e invalida a aprovacao. */
export const MATERIAL_FIELDS = ["caption", "cta", "hashtags", "briefing", "assets", "assetOrder", "format", "channel"] as const;
/** So planejamento: pode mudar sem invalidar nada. */
export const PLANNING_FIELDS = ["title", "description", "plannedOn", "assigneeId", "assigneeVisibleToClient", "pillar", "objective", "internalNotes"] as const;

export type EditOutcome =
  | { ok: true; kind: "planning" }
  /** Material em fase de producao: edita-se o RASCUNHO da versao; o status so muda quando a versao for enviada. */
  | { ok: true; kind: "material"; mode: "edit_draft"; invalidatesApproval: false; nextStatus: ContentStatus }
  /** Material depois do envio: nasce nova versao ja enviada; aprovacao anterior invalidada; volta a fila. */
  | { ok: true; kind: "material"; mode: "new_version_sent"; invalidatesApproval: boolean; nextStatus: "AGUARDANDO_APROVACAO" }
  | { ok: false; code: "TERMINAL" | "MATERIAL_LOCKED" | "UNKNOWN_FIELD"; message: string };

export function classifyContentEdit(status: ContentStatus, changedFields: readonly string[]): EditOutcome {
  for (const f of changedFields) {
    if (!(MATERIAL_FIELDS as readonly string[]).includes(f) && !(PLANNING_FIELDS as readonly string[]).includes(f)) {
      return { ok: false, code: "UNKNOWN_FIELD", message: `Campo desconhecido: ${f}.` };
    }
  }
  if (status === "CANCELADO") return { ok: false, code: "TERMINAL", message: "Conteudo cancelado nao e editado." };
  const material = changedFields.some((f) => (MATERIAL_FIELDS as readonly string[]).includes(f));
  if (!material) return { ok: true, kind: "planning" };
  if (status === "PUBLICADO" || status === "ANALISADO") {
    return { ok: false, code: "MATERIAL_LOCKED", message: "Conteudo publicado nao tem o material editado; registre a correcao como comentario." };
  }
  if (status === "PLANEJADO" || status === "EM_PRODUCAO" || status === "EM_REVISAO") {
    return { ok: true, kind: "material", mode: "edit_draft", invalidatesApproval: false, nextStatus: status };
  }
  return {
    ok: true,
    kind: "material",
    mode: "new_version_sent",
    invalidatesApproval: status === "APROVADO" || status === "AGENDADO",
    nextStatus: "AGUARDANDO_APROVACAO",
  };
}

/** Status resultante de ENVIAR uma versao; null quando nao se pode enviar versao nesse estado. */
export function statusAfterVersionSent(status: ContentStatus): ContentStatus | null {
  const edge = CONTENT_EDGES.find((e) => e.from === status && e.trigger === "version_sent");
  if (edge) return edge.to;
  if (status === "AGUARDANDO_APROVACAO") return "AGUARDANDO_APROVACAO"; // substitui a versao ainda sem decisao
  return null;
}

// ---------- Calendario: reagendar ----------

export type RescheduleRefusal = "CANCELLED" | "OUTSIDE_CYCLE_MONTH" | "PUBLISHED_IN_PAST" | "INVALID_DATE";
export type RescheduleResult = { ok: true } | { ok: false; code: RescheduleRefusal; message: string };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** Datas como "AAAA-MM-DD" (data local do cliente). `today` vem de fora para a funcao continuar pura. */
export function checkReschedule(input: { status: ContentStatus; cycleYear: number; cycleMonth: number; newDate: string; today: string }): RescheduleResult {
  const date = parseIsoDate(input.newDate);
  if (!date || !parseIsoDate(input.today)) return { ok: false, code: "INVALID_DATE", message: "Data invalida." };
  if (input.status === "CANCELADO") return { ok: false, code: "CANCELLED", message: "Peca cancelada nao e reagendada." };
  if (date.year !== input.cycleYear || date.month !== input.cycleMonth) {
    return {
      ok: false,
      code: "OUTSIDE_CYCLE_MONTH",
      message: "A data precisa ficar dentro do mes do ciclo; para sair dele, mova a peca de ciclo (ADMIN, com justificativa).",
    };
  }
  if ((input.status === "PUBLICADO" || input.status === "ANALISADO") && input.newDate < input.today) {
    return { ok: false, code: "PUBLISHED_IN_PAST", message: "Peca ja publicada nao e reagendada para o passado." };
  }
  return { ok: true };
}
