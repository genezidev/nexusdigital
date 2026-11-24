import type { Prisma } from "@/generated/prisma/client";
import type { ContentStatus } from "@/generated/prisma/enums";
import { assertCan } from "@/server/authorization/permissions";
import type { Scoped } from "@/server/db/scope";
import type { ProgressItem } from "@/server/domain/progress";

export async function listCycles(s: Scoped, subscriptionId?: string) {
  assertCan(s.ctx, "cycle:read");
  return s.tx.editorialCycle.findMany({
    where: { clientId: s.ctx.clientId, ...(subscriptionId ? { subscriptionId } : {}) },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
}

export async function getCycle(s: Scoped, id: string) {
  assertCan(s.ctx, "cycle:read");
  return s.tx.editorialCycle.findFirst({ where: { id, clientId: s.ctx.clientId } });
}

export async function insertCycle(
  s: Scoped,
  data: { subscriptionId: string; year: number; month: number; quota: number; previousQuota?: number; quotaChangeReason?: string },
) {
  assertCan(s.ctx, "cycle:manage");
  return s.tx.editorialCycle.create({ data: { ...data, clientId: s.ctx.clientId } });
}

export async function updateCycle(s: Scoped, id: string, data: Prisma.EditorialCycleUncheckedUpdateManyInput) {
  assertCan(s.ctx, "cycle:manage");
  const { count } = await s.tx.editorialCycle.updateMany({ where: { id, clientId: s.ctx.clientId }, data });
  return count;
}

/**
 * Contadores do ciclo por (status, conta na cota, bonus). Passa pela funcao cycle_progress_counts, que trava no
 * cliente da sessao e devolve so NUMEROS: o portal ve o progresso de todo o ciclo sem ver pecas ainda internas.
 */
export async function cycleProgressItems(s: Scoped, cycleId: string): Promise<ProgressItem[]> {
  assertCan(s.ctx, "cycle:read");
  const rows = await s.tx.$queryRaw<{ status: ContentStatus; counts_toward_quota: boolean; is_bonus: boolean; total: bigint }[]>`
    SELECT status, counts_toward_quota, is_bonus, total FROM cycle_progress_counts(${cycleId}::uuid)`;
  return rows.map((r) => ({ status: r.status, countsTowardQuota: r.counts_toward_quota, isBonus: r.is_bonus, count: Number(r.total) }));
}
