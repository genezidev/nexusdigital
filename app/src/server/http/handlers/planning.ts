import "server-only";
import type { NextRequest } from "next/server";
import { cycleBody, cycleListQuery, portalPlanQuery, planBody, planVersionBody, quotaBody, reasonBody, subscriptionBody, subscriptionListQuery, subscriptionPatchBody, toDay } from "@/lib/schemas-fase2";
import { getDb } from "@/server/db/client";
import { requireAdmin, requireStaffArea } from "@/server/http/actor";
import type { Authorized } from "@/server/http/api";
import { parseQuery, uuid } from "@/server/http/api";
import { cycleAgencyOut, cyclePortalOut, page, planOut, progressAgencyOut, progressPortalOut, subscriptionAgencyOut, subscriptionPortalOut } from "@/server/http/dto-fase2";
import { parseBody } from "@/server/http/handler";
import { json } from "@/server/http/respond";
import {
  adjustCycleQuota,
  changeSubscription,
  closeCycle,
  createPlan,
  createPlanVersionFromPlan,
  createSubscription,
  deactivatePlan,
  listCatalog,
  openCycle,
  reopenCycle,
} from "@/server/services/planning";
import { getCycleView, loadPortalPlan, pageCyclesFor, pageSubscriptionsFor } from "@/server/services/queries";

// Plano (catalogo da agencia, sem cliente), assinatura, ciclo e progresso. Escrita so do ADMIN (assertCan nos servicos
// e RLS no banco); STAFF atribuido le; o portal le so o retrato da assinatura e os NUMEROS do progresso.

export async function listPlansResponse(req: NextRequest, requestId: string) {
  const actor = await requireStaffArea(req.headers);
  const plans = await listCatalog(getDb(), actor);
  return json({ items: plans.map((p) => planOut.parse(p)) }, 200, requestId);
}

export async function postPlan(req: NextRequest, requestId: string) {
  const actor = await requireAdmin(req.headers);
  const b = await parseBody(req, planBody);
  return json(planOut.parse(await createPlan(getDb(), actor, b)), 201, requestId);
}

export async function postPlanVersion(req: NextRequest, planId: string, requestId: string) {
  const actor = await requireAdmin(req.headers);
  const b = await parseBody(req, planVersionBody);
  return json(planOut.parse(await createPlanVersionFromPlan(getDb(), actor, uuid(planId), b)), 201, requestId);
}

export async function postPlanDeactivate(req: NextRequest, planId: string, requestId: string) {
  const actor = await requireAdmin(req.headers);
  await deactivatePlan(getDb(), actor, uuid(planId));
  return json({ ok: true }, 200, requestId);
}

export async function listSubscriptions(a: Authorized, req: NextRequest, requestId: string) {
  const q = parseQuery(req, subscriptionListQuery);
  const { items, total } = await pageSubscriptionsFor(getDb(), a.ctx, q);
  return json(page(items.map((i) => subscriptionAgencyOut.parse(i)), total, q.page, q.pageSize), 200, requestId);
}

export async function postSubscription(a: Authorized, req: NextRequest, requestId: string) {
  const b = await parseBody(req, subscriptionBody);
  const sub = await createSubscription(getDb(), a.ctx, { planId: b.planId, startsOn: toDay(b.startsOn), endsOn: b.endsOn ? toDay(b.endsOn) : null, billingDay: b.billingDay });
  return json(subscriptionAgencyOut.parse(sub), 201, requestId);
}

export async function patchSubscription(a: Authorized, req: NextRequest, subscriptionId: string, requestId: string) {
  const b = await parseBody(req, subscriptionPatchBody);
  await changeSubscription(getDb(), a.ctx, uuid(subscriptionId), { status: b.status, billingDay: b.billingDay, ...(b.endsOn === undefined ? {} : { endsOn: b.endsOn ? toDay(b.endsOn) : null }) });
  return json({ ok: true }, 200, requestId);
}

export async function listCycles(a: Authorized, req: NextRequest, requestId: string) {
  const q = parseQuery(req, cycleListQuery);
  const { items, total } = await pageCyclesFor(getDb(), a.ctx, q);
  return json(page(items.map((i) => cycleAgencyOut.parse(i)), total, q.page, q.pageSize), 200, requestId);
}

export async function postCycle(a: Authorized, req: NextRequest, requestId: string) {
  const b = await parseBody(req, cycleBody);
  const cycle = await openCycle(getDb(), a.ctx, b);
  return json(cycleAgencyOut.parse(cycle), 201, requestId);
}

/** Ciclo com progresso (admin: funil completo e fora da cota; fechado, le o retrato gravado). */
export async function getCycleResponse(a: Authorized, cycleId: string, requestId: string) {
  const v = await getCycleView(getDb(), a.ctx, uuid(cycleId));
  return json({ cycle: cycleAgencyOut.parse(v.cycle), progress: progressAgencyOut.parse(v.progress) }, 200, requestId);
}

export async function postCloseCycle(a: Authorized, cycleId: string, requestId: string) {
  await closeCycle(getDb(), a.ctx, uuid(cycleId));
  return json({ ok: true }, 200, requestId);
}

export async function postReopenCycle(a: Authorized, req: NextRequest, cycleId: string, requestId: string) {
  const b = await parseBody(req, reasonBody);
  await reopenCycle(getDb(), a.ctx, uuid(cycleId), b.reason);
  return json({ ok: true }, 200, requestId);
}

export async function putCycleQuota(a: Authorized, req: NextRequest, cycleId: string, requestId: string) {
  const b = await parseBody(req, quotaBody);
  await adjustCycleQuota(getDb(), a.ctx, uuid(cycleId), b.quota, b.reason);
  return json({ ok: true }, 200, requestId);
}

/** Portal: plano contratado (so o retrato da assinatura) e progresso do ciclo mais recente, so numeros. */
export async function getPortalPlan(a: Authorized, req: NextRequest, requestId: string) {
  const q = parseQuery(req, portalPlanQuery);
  const v = await loadPortalPlan(getDb(), a.ctx, { cycleId: q.cycleId });
  return json(
    {
      subscription: v.subscription ? subscriptionPortalOut.parse(v.subscription) : null,
      cycle: v.cycle ? cyclePortalOut.parse(v.cycle) : null,
      progress: v.progress ? progressPortalOut.parse(v.progress) : null,
    },
    200,
    requestId,
  );
}
