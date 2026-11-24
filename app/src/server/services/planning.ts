import { Prisma } from "@/generated/prisma/client";
import type { SubscriptionStatus } from "@/generated/prisma/enums";
import { systemContextForAdmin, systemContextForStaffArea, type TenantContext } from "@/server/authorization/context";
import { assertCan } from "@/server/authorization/permissions";
import type { Db } from "@/server/db/client";
import { withSystemScoped, withTenant } from "@/server/db/scope";
import { computeCycleProgress, type CycleProgress } from "@/server/domain/progress";
import { MIN_REASON_LENGTH } from "@/server/domain/content-state";
import { ConflictError, DomainRuleError, NotFoundError } from "@/server/errors";
import { recordAudit, recordSystemAudit } from "@/server/repositories/audit";
import { cycleProgressItems, getCycle, insertCycle, updateCycle } from "@/server/repositories/cycles";
import { getPlan, getPlanInTenant, insertPlan, latestPlanVersion, listPlans, setPlanActive, type PlanInput } from "@/server/repositories/plans";
import { getSubscription, insertSubscription, updateSubscription } from "@/server/repositories/subscriptions";
import type { Actor } from "@/server/services/access";

// Plano (catalogo), assinatura (retrato congelado) e ciclo editorial mensal com cota. Todas as mutacoes
// sensiveis gravam auditoria na mesma transacao (sem texto livre de comentario nem conteudo de arquivo).

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

function requireReason(reason: string | undefined, what: string): string {
  const r = (reason ?? "").trim();
  if (r.length < MIN_REASON_LENGTH) throw new DomainRuleError("REASON_REQUIRED", `${what} exige justificativa de pelo menos ${MIN_REASON_LENGTH} caracteres.`);
  return r;
}

// ---------- Planos (so ADMIN escreve; STAFF le) ----------

export async function createPlan(db: Db, actor: Actor, input: PlanInput) {
  const sys = await systemContextForAdmin(db, actor.userId);
  try {
    return await withSystemScoped(db, sys, async (s) => {
      const plan = await insertPlan(s, { ...input, version: 1 });
      await recordSystemAudit(s, { action: "plan.created", entityType: "service_plan", entityId: plan.id, diff: { code: plan.code, version: 1, monthlyAmountCents: plan.monthlyAmountCents, monthlyQuota: plan.monthlyQuota } });
      return plan;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError("PLAN_EXISTS", "Ja existe plano com este codigo.");
    throw e;
  }
}

/** Plano publicado nao e editado: mudar cria a proxima versao e desativa as anteriores. Assinaturas mantem o retrato. */
export async function createPlanVersion(db: Db, actor: Actor, code: string, input: Omit<PlanInput, "code">) {
  const sys = await systemContextForAdmin(db, actor.userId);
  try {
    return await withSystemScoped(db, sys, async (s) => {
      const last = await latestPlanVersion(s, code);
      if (!last) throw new NotFoundError();
      const plan = await insertPlan(s, { ...input, code, version: last.version + 1 });
      for (const old of (await listPlans(s)).filter((p) => p.code === code && p.id !== plan.id && p.active)) await setPlanActive(s, old.id, false);
      await recordSystemAudit(s, { action: "plan.version_created", entityType: "service_plan", entityId: plan.id, diff: { code, version: plan.version, previousVersion: last.version, monthlyAmountCents: plan.monthlyAmountCents, monthlyQuota: plan.monthlyQuota } });
      return plan;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError("PLAN_VERSION_CONFLICT", "Outra versao foi criada ao mesmo tempo.");
    throw e;
  }
}

/** Nova versao a partir de um plano ja publicado (o id vem da URL; o codigo, do banco). */
export async function createPlanVersionFromPlan(db: Db, actor: Actor, planId: string, input: Omit<PlanInput, "code">) {
  const sys = await systemContextForAdmin(db, actor.userId);
  const base = await withSystemScoped(db, sys, (s) => getPlan(s, planId));
  if (!base) throw new NotFoundError();
  return createPlanVersion(db, actor, base.code, input);
}

export async function deactivatePlan(db: Db, actor: Actor, planId: string) {
  const sys = await systemContextForAdmin(db, actor.userId);
  return withSystemScoped(db, sys, async (s) => {
    if (!(await getPlan(s, planId))) throw new NotFoundError();
    await setPlanActive(s, planId, false);
    await recordSystemAudit(s, { action: "plan.deactivated", entityType: "service_plan", entityId: planId });
  });
}

export async function listCatalog(db: Db, actor: Actor) {
  const sys = await systemContextForStaffArea(db, actor.userId);
  return withSystemScoped(db, sys, (s) => listPlans(s));
}

// ---------- Assinatura ----------

export async function createSubscription(db: Db, ctx: TenantContext, input: { planId: string; startsOn: Date; endsOn?: Date | null; billingDay: number }) {
  assertCan(ctx, "subscription:manage");
  try {
    return await withTenant(db, ctx, async (s) => {
      const plan = await getPlanInTenant(s, input.planId);
      if (!plan || !plan.active) throw new NotFoundError();
      const sub = await insertSubscription(s, {
        planId: plan.id,
        planCode: plan.code,
        planName: plan.name,
        planVersion: plan.version,
        scopeSnapshot: plan.scope,
        exclusionsSnapshot: plan.exclusions,
        amountCents: plan.monthlyAmountCents,
        quota: plan.monthlyQuota,
        revisionsPerPiece: plan.revisionsPerPiece,
        approvalDeadlineBusinessDays: plan.approvalDeadlineBusinessDays,
        startsOn: input.startsOn,
        endsOn: input.endsOn ?? null,
        billingDay: input.billingDay,
      });
      await recordAudit(s, { action: "subscription.created", entityType: "subscription", entityId: sub.id, diff: { planCode: plan.code, planVersion: plan.version, amountCents: sub.amountCents, quota: sub.quota, startsOn: input.startsOn } });
      return sub;
    });
  } catch (e) {
    // Indice parcial: um cliente tem no maximo uma assinatura ATIVA.
    if (isUniqueViolation(e)) throw new ConflictError("SUBSCRIPTION_ACTIVE_EXISTS", "O cliente ja tem uma assinatura ativa.");
    throw e;
  }
}

export async function changeSubscription(db: Db, ctx: TenantContext, id: string, patch: { status?: SubscriptionStatus; endsOn?: Date | null; billingDay?: number }) {
  assertCan(ctx, "subscription:manage");
  try {
    return await withTenant(db, ctx, async (s) => {
      const before = await getSubscription(s, id);
      if (!before) throw new NotFoundError();
      await updateSubscription(s, id, patch);
      await recordAudit(s, { action: "subscription.updated", entityType: "subscription", entityId: id, diff: { from: { status: before.status, endsOn: before.endsOn, billingDay: before.billingDay }, to: patch } });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError("SUBSCRIPTION_ACTIVE_EXISTS", "O cliente ja tem uma assinatura ativa.");
    throw e;
  }
}

// ---------- Ciclo ----------

function monthBounds(year: number, month: number) {
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 0)) };
}

export async function openCycle(db: Db, ctx: TenantContext, input: { subscriptionId: string; year: number; month: number; quota?: number; reason?: string }) {
  assertCan(ctx, "cycle:manage");
  try {
    return await withTenant(db, ctx, async (s) => {
      const sub = await getSubscription(s, input.subscriptionId);
      if (!sub) throw new NotFoundError();
      if (sub.status !== "ATIVA") throw new DomainRuleError("SUBSCRIPTION_NOT_ACTIVE", "So assinatura ATIVA abre ciclo.");
      const { start, end } = monthBounds(input.year, input.month);
      if (sub.startsOn > end || (sub.endsOn && sub.endsOn < start)) {
        throw new DomainRuleError("CYCLE_OUTSIDE_SUBSCRIPTION", "O mes do ciclo esta fora da vigencia da assinatura.");
      }
      const quota = input.quota ?? sub.quota;
      const adjusted = quota !== sub.quota;
      const reason = adjusted ? requireReason(input.reason, "Ajustar a cota do ciclo") : undefined;
      const cycle = await insertCycle(s, { subscriptionId: sub.id, year: input.year, month: input.month, quota, ...(adjusted ? { previousQuota: sub.quota, quotaChangeReason: reason } : {}) });
      await recordAudit(s, { action: "cycle.created", entityType: "cycle", entityId: cycle.id, diff: { year: input.year, month: input.month, quota, previousQuota: adjusted ? sub.quota : undefined } });
      return cycle;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError("CYCLE_EXISTS", "Ja existe ciclo para esta assinatura e mes.");
    throw e;
  }
}

export async function adjustCycleQuota(db: Db, ctx: TenantContext, cycleId: string, quota: number, reason: string) {
  assertCan(ctx, "cycle:manage");
  const why = requireReason(reason, "Ajustar a cota");
  if (!Number.isInteger(quota) || quota < 0) throw new DomainRuleError("INVALID_QUOTA", "A cota precisa ser um inteiro maior ou igual a zero.");
  return withTenant(db, ctx, async (s) => {
    const cycle = await getCycle(s, cycleId);
    if (!cycle) throw new NotFoundError();
    if (cycle.status !== "ABERTO") throw new DomainRuleError("CYCLE_CLOSED", "Ciclo encerrado nao aceita ajuste de cota.");
    await updateCycle(s, cycleId, { quota, previousQuota: cycle.quota, quotaChangeReason: why });
    await recordAudit(s, { action: "cycle.quota_adjusted", entityType: "cycle", entityId: cycleId, diff: { from: cycle.quota, to: quota } });
  });
}

export async function closeCycle(db: Db, ctx: TenantContext, cycleId: string, now: Date = new Date()) {
  assertCan(ctx, "cycle:manage");
  return withTenant(db, ctx, async (s) => {
    const cycle = await getCycle(s, cycleId);
    if (!cycle) throw new NotFoundError();
    if (cycle.status !== "ABERTO") throw new DomainRuleError("CYCLE_CLOSED", "O ciclo ja esta encerrado.");
    const sub = await getSubscription(s, cycle.subscriptionId);
    const progress = computeCycleProgress(cycle.quota, await cycleProgressItems(s, cycleId));
    const snapshot = {
      progress,
      scope: sub && { planName: sub.planName, planVersion: sub.planVersion, scope: sub.scopeSnapshot, exclusions: sub.exclusionsSnapshot, amountCents: sub.amountCents, quota: sub.quota },
      closedAt: now.toISOString(),
    };
    await updateCycle(s, cycleId, { status: "ENCERRADO", closedAt: now, closeSnapshot: snapshot as unknown as Prisma.InputJsonValue });
    await recordAudit(s, { action: "cycle.closed", entityType: "cycle", entityId: cycleId, diff: { quota: cycle.quota, published: progress.published, percent: progress.percent } });
    return snapshot;
  });
}

export async function reopenCycle(db: Db, ctx: TenantContext, cycleId: string, reason: string, now: Date = new Date()) {
  assertCan(ctx, "cycle:manage");
  const why = requireReason(reason, "Reabrir o ciclo");
  return withTenant(db, ctx, async (s) => {
    const cycle = await getCycle(s, cycleId);
    if (!cycle) throw new NotFoundError();
    if (cycle.status !== "ENCERRADO") throw new DomainRuleError("CYCLE_NOT_CLOSED", "So ciclo encerrado reabre.");
    await updateCycle(s, cycleId, { status: "ABERTO", reopenedAt: now, reopenReason: why });
    await recordAudit(s, { action: "cycle.reopened", entityType: "cycle", entityId: cycleId });
  });
}

/** Ciclo aberto: calculado dos contadores atuais. Ciclo encerrado: o retrato gravado no fechamento. */
export async function getCycleProgress(db: Db, ctx: TenantContext, cycleId: string): Promise<CycleProgress & { source: "live" | "snapshot" }> {
  return withTenant(db, ctx, async (s) => {
    const cycle = await getCycle(s, cycleId);
    if (!cycle) throw new NotFoundError();
    const snap = cycle.closeSnapshot as { progress?: CycleProgress } | null;
    if (cycle.status === "ENCERRADO" && snap?.progress) return { ...snap.progress, source: "snapshot" as const };
    return { ...computeCycleProgress(cycle.quota, await cycleProgressItems(s, cycleId)), source: "live" as const };
  });
}
