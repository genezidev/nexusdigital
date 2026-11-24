import type { TenantContext } from "@/server/authorization/context";
import { assertCan } from "@/server/authorization/permissions";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/scope";
import { NotFoundError } from "@/server/errors";
import { listLinkedAssets, pageAssets, type AssetPageQuery } from "@/server/repositories/assets";
import { getContent, listApprovals, listComments, listVersions, pageContents, type ContentPageQuery } from "@/server/repositories/contents";
import { getClientById } from "@/server/repositories/clients";
import { getCycle, pageCycles } from "@/server/repositories/cycles";
import { getRecording, getScript, listRecordings, pageScripts, type ScriptPageQuery } from "@/server/repositories/scripts";
import { getActiveSubscription, listSubscriptions, pageSubscriptions } from "@/server/repositories/subscriptions";
import { getCycleProgress } from "@/server/services/planning";

// Leituras da fase 2 para a API: paginacao, filtros e ordenacao NO SERVIDOR. Toda leitura passa por withTenant
// (cliente da sessao) e pelas listas explicitas de campos dos repositorios; a RLS repete a regra no banco.

export const pageContentsFor = (db: Db, ctx: TenantContext, q: ContentPageQuery) => withTenant(db, ctx, (s) => pageContents(s, q));
export const pageScriptsFor = (db: Db, ctx: TenantContext, q: ScriptPageQuery) => withTenant(db, ctx, (s) => pageScripts(s, q));
export const pageAssetsFor = (db: Db, ctx: TenantContext, q: AssetPageQuery) => withTenant(db, ctx, (s) => pageAssets(s, q));
export const pageCyclesFor = (db: Db, ctx: TenantContext, q: Parameters<typeof pageCycles>[1]) => withTenant(db, ctx, (s) => pageCycles(s, q));
export const pageSubscriptionsFor = (db: Db, ctx: TenantContext, q: Parameters<typeof pageSubscriptions>[1]) => withTenant(db, ctx, (s) => pageSubscriptions(s, q));

/** Conteudo com versoes, decisoes, comentarios e arquivos ja filtrados para quem pede (cliente: so o compartilhado). */
export async function getContentView(db: Db, ctx: TenantContext, contentId: string) {
  return withTenant(db, ctx, async (s) => {
    const content = await getContent(s, contentId);
    if (!content) throw new NotFoundError();
    const [versions, approvals, comments] = await Promise.all([listVersions(s, contentId), listApprovals(s, contentId), listComments(s, { contentId })]);
    const assets = versions.length ? await listLinkedAssets(s, { versionId: { in: versions.map((v) => v.id) } }) : [];
    const evidence = await listLinkedAssets(s, { contentId });
    return { content, versions, approvals, comments, assets: [...assets, ...evidence] };
  });
}

export async function getScriptView(db: Db, ctx: TenantContext, scriptId: string) {
  return withTenant(db, ctx, async (s) => {
    const script = await getScript(s, scriptId);
    if (!script) throw new NotFoundError();
    const [recordings, comments] = await Promise.all([listRecordings(s, scriptId), listComments(s, { scriptId })]);
    const assets = await listLinkedAssets(s, {
      OR: [{ scriptId }, ...(recordings.length ? [{ recordingId: { in: recordings.map((r) => r.id) } }] : [])],
    });
    return { script, recordings, comments, assets };
  });
}

/** Gravacao visivel para quem pede (cliente: so de roteiro a partir de ENVIADO); base das acoes de revisao. */
export async function getRecordingFor(db: Db, ctx: TenantContext, recordingId: string) {
  return withTenant(db, ctx, async (s) => {
    const rec = await getRecording(s, recordingId);
    if (!rec) throw new NotFoundError();
    return rec;
  });
}

export async function getCycleView(db: Db, ctx: TenantContext, cycleId: string) {
  const [cycle, progress] = await Promise.all([withTenant(db, ctx, (s) => getCycle(s, cycleId)), getCycleProgress(db, ctx, cycleId)]);
  if (!cycle) throw new NotFoundError();
  return { cycle, progress };
}

/** Competencia (mes) do calendario: pecas com data prevista no mes, por formato e status. */
export async function calendarFor(db: Db, ctx: TenantContext, q: { year: number; month: number; format?: ContentPageQuery["format"]; status?: ContentPageQuery["status"] }) {
  const from = new Date(Date.UTC(q.year, q.month - 1, 1));
  const to = new Date(Date.UTC(q.year, q.month, 0));
  const { items } = await withTenant(db, ctx, (s) =>
    pageContents(s, { page: 1, pageSize: 500, sort: "plannedOn", dir: "asc", plannedFrom: from, plannedTo: to, format: q.format, status: q.status }),
  );
  return items;
}

/** Ano e mes corrente no fuso do cliente (competencia). Fuso invalido cai em UTC. */
export function currentCompetence(timeZone: string, now: Date = new Date()): { year: number; month: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now);
    return { year: Number(parts.find((p) => p.type === "year")?.value), month: Number(parts.find((p) => p.type === "month")?.value) };
  } catch {
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  }
}

/**
 * Portal: plano contratado (so o retrato da assinatura) e progresso de UM ciclo, so numeros. Sem `cycleId`, vale o
 * ciclo da competencia atual no fuso do cliente (ou o mais recente anterior; sem nenhum, o primeiro futuro).
 */
export async function loadPortalPlan(db: Db, ctx: TenantContext, opts: { cycleId?: string; now?: Date } = {}) {
  assertCan(ctx, "subscription:read");
  const sub = await withTenant(db, ctx, async (s) => (await getActiveSubscription(s)) ?? (await listSubscriptions(s))[0] ?? null);
  if (!sub) return { subscription: null, cycle: null, progress: null };
  let cycle;
  if (opts.cycleId) {
    cycle = await withTenant(db, ctx, (s) => getCycle(s, opts.cycleId!));
    if (!cycle) throw new NotFoundError();
  } else {
    const client = await withTenant(db, ctx, (s) => getClientById(s, ctx.clientId));
    const now = currentCompetence(client?.timezone ?? "UTC", opts.now);
    const cycles = (await pageCyclesFor(db, ctx, { page: 1, pageSize: 50, subscriptionId: sub.id, dir: "desc" })).items;
    cycle = cycles.find((c) => c.year * 12 + c.month <= now.year * 12 + now.month) ?? cycles.at(-1) ?? null;
  }
  const progress = cycle ? await getCycleProgress(db, ctx, cycle.id) : null;
  return { subscription: sub, cycle, progress };
}
