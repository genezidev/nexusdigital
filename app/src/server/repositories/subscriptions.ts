import type { SubscriptionStatus } from "@/generated/prisma/enums";
import { assertCan } from "@/server/authorization/permissions";
import type { Scoped } from "@/server/db/scope";

// Toda consulta leva client_id = cliente da sessao, inclusive a busca por id. O cliente le o proprio retrato.

export async function listSubscriptions(s: Scoped) {
  assertCan(s.ctx, "subscription:read");
  return s.tx.subscription.findMany({ where: { clientId: s.ctx.clientId }, orderBy: { startsOn: "desc" } });
}

export async function getSubscription(s: Scoped, id: string) {
  assertCan(s.ctx, "subscription:read");
  return s.tx.subscription.findFirst({ where: { id, clientId: s.ctx.clientId } });
}

export async function getActiveSubscription(s: Scoped) {
  assertCan(s.ctx, "subscription:read");
  return s.tx.subscription.findFirst({ where: { clientId: s.ctx.clientId, status: "ATIVA" } });
}

export interface NewSubscription {
  planId: string;
  planCode: string;
  planName: string;
  planVersion: number;
  scopeSnapshot: string;
  exclusionsSnapshot: string;
  amountCents: number;
  quota: number;
  revisionsPerPiece: number;
  approvalDeadlineBusinessDays: number;
  startsOn: Date;
  endsOn: Date | null;
  billingDay: number;
}

export async function insertSubscription(s: Scoped, data: NewSubscription) {
  assertCan(s.ctx, "subscription:manage");
  return s.tx.subscription.create({ data: { ...data, clientId: s.ctx.clientId } });
}

export async function updateSubscription(s: Scoped, id: string, patch: { status?: SubscriptionStatus; endsOn?: Date | null; billingDay?: number }) {
  assertCan(s.ctx, "subscription:manage");
  const { count } = await s.tx.subscription.updateMany({ where: { id, clientId: s.ctx.clientId }, data: patch });
  return count;
}
