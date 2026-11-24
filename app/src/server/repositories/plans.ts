import { assertCan } from "@/server/authorization/permissions";
import type { Scoped, SystemScoped } from "@/server/db/scope";
import { ForbiddenError } from "@/server/errors";

// Catalogo de planos da agencia: SEM client_id. So a agencia le (ADMIN e STAFF); so o ADMIN escreve.
// O portal nunca chega aqui: le plano e preco do retrato guardado na assinatura. A RLS de service_plans
// recusa o escopo de cliente mesmo se o codigo errar.

function assertCatalogRead(s: SystemScoped) {
  if (s.sys.reason !== "admin" && s.sys.reason !== "staff-area") throw new ForbiddenError();
}
function assertCatalogWrite(s: SystemScoped) {
  if (s.sys.reason !== "admin") throw new ForbiddenError();
}

export interface PlanInput {
  code: string;
  name: string;
  monthlyAmountCents: number;
  monthlyQuota: number;
  revisionsPerPiece: number;
  approvalDeadlineBusinessDays: number;
  scope: string;
  exclusions: string;
}

export async function listPlans(s: SystemScoped) {
  assertCatalogRead(s);
  return s.tx.servicePlan.findMany({ orderBy: [{ code: "asc" }, { version: "desc" }] });
}

export async function getPlan(s: SystemScoped, id: string) {
  assertCatalogRead(s);
  return s.tx.servicePlan.findUnique({ where: { id } });
}

export async function latestPlanVersion(s: SystemScoped, code: string) {
  assertCatalogRead(s);
  return s.tx.servicePlan.findFirst({ where: { code }, orderBy: { version: "desc" } });
}

export async function insertPlan(s: SystemScoped, data: PlanInput & { version: number }) {
  assertCatalogWrite(s);
  return s.tx.servicePlan.create({ data });
}

export async function setPlanActive(s: SystemScoped, id: string, active: boolean) {
  assertCatalogWrite(s);
  return s.tx.servicePlan.update({ where: { id }, data: { active } });
}

/** Leitura dentro de um cliente (criar assinatura): so lado da agencia, conferido tambem pela RLS. */
export async function getPlanInTenant(s: Scoped, id: string) {
  assertCan(s.ctx, "plan:read");
  return s.tx.servicePlan.findUnique({ where: { id } });
}
