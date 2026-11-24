import type { ContentStatus } from "@/generated/prisma/enums";

// Calculo de progresso do ciclo editorial: UMA funcao pura, usada por todas as telas (spec 0002,
// "Calculo de progresso"; contexto/ESPECIFICACAO-MESTRE.md 5.2). Sem banco, sem relogio, sem arredondamento de
// ponto flutuante: a porcentagem sai de aritmetica inteira (D-0013).

/** Estados que ja tiveram uma versao enviada para aprovacao ("produzidas"). */
export const PRODUCED_STATUSES: readonly ContentStatus[] = [
  "AGUARDANDO_APROVACAO",
  "EM_REVISAO",
  "APROVADO",
  "AGENDADO",
  "PUBLICADO",
  "ANALISADO",
];
/** Aprovacao valida e nao invalidada. */
export const APPROVED_STATUSES: readonly ContentStatus[] = ["APROVADO", "AGENDADO", "PUBLICADO", "ANALISADO"];
/** Numerador do progresso. */
export const PUBLISHED_STATUSES: readonly ContentStatus[] = ["PUBLICADO", "ANALISADO"];

export interface ProgressItem {
  status: ContentStatus;
  countsTowardQuota: boolean;
  isBonus: boolean;
  /** Quantas pecas com estas mesmas caracteristicas (padrao 1): aceita contagens ja agrupadas pelo banco. */
  count?: number;
}

export interface FunnelCounts {
  planned: number;
  produced: number;
  approved: number;
  published: number;
}

export interface CycleProgress extends FunnelCounts {
  quota: number;
  /** false quando a cota e zero (ou ausente): a tela mostra "sem cota definida" e nunca divide por zero. */
  hasQuota: boolean;
  /** Inteiro de 0 a 100, arredondado para BAIXO; null sem cota. So chega a 100 com publicadas >= cota. */
  percent: number | null;
  /** Publicadas que contam acima da cota; sem cota definida fica 0 (nao ha meta para exceder). */
  surplus: number;
  /** Stories, bonus e o que foi marcado como nao contavel: mostrado a parte, nunca somado. Cancelados nao entram. */
  outsideQuota: FunnelCounts;
}

const ZERO: FunnelCounts = { planned: 0, produced: 0, approved: 0, published: 0 };

function addTo(target: FunnelCounts, status: ContentStatus, n: number): void {
  target.planned += n;
  if (PRODUCED_STATUSES.includes(status)) target.produced += n;
  if (APPROVED_STATUSES.includes(status)) target.approved += n;
  if (PUBLISHED_STATUSES.includes(status)) target.published += n;
}

export function computeCycleProgress(quota: number, items: readonly ProgressItem[]): CycleProgress {
  if (!Number.isInteger(quota) || quota < 0) throw new RangeError("A cota do ciclo precisa ser um inteiro maior ou igual a zero.");
  const counted: FunnelCounts = { ...ZERO };
  const outside: FunnelCounts = { ...ZERO };
  for (const item of items) {
    const n = item.count ?? 1;
    if (!Number.isInteger(n) || n < 0) throw new RangeError("A quantidade de pecas precisa ser um inteiro maior ou igual a zero.");
    if (item.status === "CANCELADO") continue; // cancelado nunca conta em nenhum contador
    addTo(item.countsTowardQuota && !item.isBonus ? counted : outside, item.status, n);
  }
  const hasQuota = quota > 0;
  return {
    ...counted,
    quota,
    hasQuota,
    percent: hasQuota ? Math.min(100, Math.floor((counted.published * 100) / quota)) : null,
    surplus: hasQuota ? Math.max(counted.published - quota, 0) : 0,
    outsideQuota: outside,
  };
}
