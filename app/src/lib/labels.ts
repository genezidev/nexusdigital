// Rotulos em pt-BR da fase 2 (apresentacao). Nada aqui decide regra: so traduz o que o servidor devolve.
// Texto SEMPRE acompanha o estado (nunca so cor), como pede o DESIGN.md.

export const FORMAT_LABEL: Record<string, string> = {
  ARTE: "Arte",
  CARROSSEL: "Carrossel",
  REEL_ANIMADO: "Reel animado",
  REEL_HUMANIZADO: "Reel humanizado",
  STORY: "Story",
  OUTRO: "Outro",
};

export const CHANNEL_LABEL: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  LINKEDIN: "LinkedIn",
  OUTRO: "Outro",
};

/** Status do conteudo na linguagem da agencia. */
export const CONTENT_STATUS_LABEL: Record<string, string> = {
  PLANEJADO: "Planejado",
  EM_PRODUCAO: "Em produção",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  EM_REVISAO: "Em revisão",
  APROVADO: "Aprovado",
  AGENDADO: "Agendado",
  PUBLICADO: "Publicado",
  ANALISADO: "Analisado",
  CANCELADO: "Cancelado",
};

/** Status do conteudo na linguagem do cliente (spec: "status em linguagem do cliente"). */
export const CONTENT_STATUS_CLIENT_LABEL: Record<string, string> = {
  PLANEJADO: "Planejado",
  EM_PRODUCAO: "Em produção",
  AGUARDANDO_APROVACAO: "Aguardando sua aprovação",
  EM_REVISAO: "Em ajuste pela agência",
  APROVADO: "Aprovado por você",
  AGENDADO: "Agendado para publicar",
  PUBLICADO: "Publicado",
  ANALISADO: "Publicado e analisado",
  CANCELADO: "Cancelado",
};

export const SCRIPT_STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ENVIADO: "Enviado ao cliente",
  AGUARDANDO_GRAVACAO: "Aguardando gravação",
  GRAVACAO_RECEBIDA: "Gravação recebida",
  EM_EDICAO: "Em edição",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  FINALIZADO: "Finalizado",
  PUBLICADO: "Publicado",
};

export const SCRIPT_STATUS_CLIENT_LABEL: Record<string, string> = {
  ...SCRIPT_STATUS_LABEL,
  ENVIADO: "Roteiro recebido",
  AGUARDANDO_GRAVACAO: "Aguardando sua gravação",
  GRAVACAO_RECEBIDA: "Gravação recebida pela agência",
  EM_EDICAO: "Em edição pela agência",
};

export const RECORDING_STATUS_LABEL: Record<string, string> = {
  ENVIADA: "Enviada, aguardando conferência",
  RECEBIDA: "Recebida pela agência",
  REGRAVACAO_SOLICITADA: "Regravação solicitada",
};

export const VISIBILITY_LABEL: Record<string, string> = { INTERNO: "Interno", COMPARTILHADO: "Compartilhado" };
export const CYCLE_STATUS_LABEL: Record<string, string> = { ABERTO: "Aberto", ENCERRADO: "Encerrado" };
export const SUBSCRIPTION_STATUS_LABEL: Record<string, string> = { ATIVA: "Ativa", PAUSADA: "Pausada", ENCERRADA: "Encerrada" };
export const DECISION_LABEL: Record<string, string> = { APROVADO: "Aprovado", REVISAO_SOLICITADA: "Revisão solicitada" };
export const ASSET_ROLE_LABEL: Record<string, string> = {
  PREVIA: "Prévia",
  FINAL: "Arquivo final",
  REFERENCIA: "Referência",
  PDF_ROTEIRO: "PDF do roteiro",
  GRAVACAO: "Gravação",
  EVIDENCIA: "Evidência de publicação",
};
export const ASSET_CATEGORY_LABEL: Record<string, string> = { IMAGEM: "Imagem", VIDEO: "Vídeo", DOCUMENTO: "Documento" };

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? "N/D";
}

/** "novembro de 2026" (competencia do ciclo). */
export function competenceLabel(year: number, month: number): string {
  return `${monthName(month)} de ${year}`;
}

/**
 * Data civil AAAA-MM-DD para DD/MM/AAAA, SEM passar por fuso: a data prevista e o dia no calendario do cliente,
 * nao um instante. Valor invalido vira "N/D".
 */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "N/D";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "N/D";
}

/** Dia de hoje (AAAA-MM-DD) no fuso do cliente. */
export function todayIsoIn(timeZone: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

const NOT_LATE = new Set(["PUBLICADO", "ANALISADO", "CANCELADO"]);

/** Atraso e SELO calculado (nao status): data prevista passou sem publicar, analisar ou cancelar. */
export function isOverdue(plannedOn: string, status: string, today: string): boolean {
  return !NOT_LATE.has(status) && plannedOn < today;
}

/** Tamanho legivel em pt-BR (1,5 MB). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "N/D";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`;
}

/** Duracao em segundos para "1 min 30 s"; N/D quando nao informada. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return "N/D";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} s`;
  return s === 0 ? `${m} min` : `${m} min ${s} s`;
}

/** Porcentagem inteira (ja arredondada para baixo pelo servidor); N/D sem cota. */
export function formatPercent(percent: number | null | undefined): string {
  return percent === null || percent === undefined ? "N/D" : `${percent}%`;
}

/** Texto de leitura do progresso: "7 de 12 publicadas (58%)" ou "Sem cota definida". */
export function progressSummary(p: { quota: number; hasQuota: boolean; percent: number | null; published: number }): string {
  if (!p.hasQuota) return "Sem cota definida";
  return `${p.published} de ${p.quota} publicadas (${formatPercent(p.percent)})`;
}
