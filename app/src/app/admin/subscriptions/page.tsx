import { Repeat } from "lucide-react";
import type { Metadata } from "next";
import { ClientScopeBar, NoClientSelected } from "@/components/app/client-scope-bar";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { ProgressCard } from "@/components/app/progress-card";
import { EmptyState } from "@/components/app/states";
import { CycleStatusBadge, SubscriptionStatusBadge } from "@/components/app/status-badges";
import { AdjustQuotaDialog, CycleActions, NewSubscriptionDialog, OpenCycleDialog, SubscriptionStatusActions } from "@/components/fase2/subscription-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCents } from "@/lib/formatting/money";
import { adminHref } from "@/lib/admin-links";
import { competenceLabel, formatDay, formatPercent, todayIsoIn } from "@/lib/labels";
import { can } from "@/server/authorization/permissions";
import { getDb } from "@/server/db/client";
import { loadAdminScope, loadPlanning, type SearchParams } from "@/server/page-data";
import { planOut } from "@/server/http/dto-fase2";
import { listCatalog } from "@/server/services/planning";
import Link from "next/link";

export const metadata: Metadata = { title: "Assinaturas e ciclos" };

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const loaded = await guarded("/admin", async () => {
    const scope = await loadAdminScope(await searchParams);
    if (!scope.selected) return { scope, planning: null, plans: [], canManage: false };
    const ctx = scope.selected.ctx;
    const planning = await loadPlanning(ctx);
    const canManage = can(ctx, "subscription:manage");
    const plans = canManage ? (await listCatalog(getDb(), scope.actor)).map((p) => planOut.parse(p)).filter((p) => p.active) : [];
    return { scope, planning, plans, canManage };
  });
  if (!loaded.ok) return loaded.view;
  const { scope, planning, plans, canManage } = loaded.data;
  const sel = scope.selected;
  const crumbs = [{ label: "Painel", href: "/admin" }, { label: "Assinaturas e ciclos" }];

  if (!sel || !planning) {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Assinaturas e ciclos" description="Plano contratado, vigência e ciclos mensais com cota e progresso." />
        <ClientScopeBar action="/admin/subscriptions" clients={scope.clients} />
        <NoClientSelected />
      </>
    );
  }

  // Para ofertar a latest de cada codigo.
  const latest = new Map<string, number>();
  for (const p of plans) latest.set(p.code, Math.max(latest.get(p.code) ?? 0, p.version));
  const planOptions = plans.filter((p) => latest.get(p.code) === p.version).map((p) => ({ id: p.id, name: p.name, version: p.version, monthlyAmountCents: p.monthlyAmountCents, monthlyQuota: p.monthlyQuota }));
  const active = planning.subscriptions.find((s) => s.status === "ATIVA");
  const cycleLabel = (c: { year: number; month: number }) => competenceLabel(c.year, c.month);
  const today = todayIsoIn(sel.timezone, new Date());
  const first = planning.cycles.length === 0;
  const currentCycle = planning.cycles.find((c) => c.status === "ABERTO");

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        title="Assinaturas e ciclos"
        description={`Cliente: ${sel.name}`}
        actions={canManage ? <NewSubscriptionDialog clientId={sel.id} plans={planOptions} /> : undefined}
      />
      <ClientScopeBar action="/admin/subscriptions" clients={scope.clients} selectedId={sel.id} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {currentCycle ? <ProgressCard title={`Progresso de ${cycleLabel(currentCycle)}`} progress={planning.progress[currentCycle.id] ?? null} /> : null}

        <Card>
          <CardHeader>
            <CardTitle>Assinaturas</CardTitle>
            <CardDescription>Valor, cota e escopo ficam congelados na assinatura a partir do plano escolhido.</CardDescription>
          </CardHeader>
          <CardContent>
            {planning.subscriptions.length === 0 ? (
              <EmptyState icon={Repeat} title="Este cliente ainda não tem assinatura" description={canManage ? "Crie a assinatura escolhendo um plano do catálogo." : "O administrador ainda não criou a assinatura."}>
                {canManage ? <NewSubscriptionDialog clientId={sel.id} plans={planOptions} /> : null}
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Assinaturas de {sel.name}</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Plano</TableHead>
                      <TableHead scope="col">Vigência</TableHead>
                      <TableHead scope="col" className="text-right">
                        Valor
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Cota
                      </TableHead>
                      <TableHead scope="col">Situação</TableHead>
                      {canManage ? (
                        <TableHead scope="col">
                          <span className="sr-only">Ações</span>
                        </TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {planning.subscriptions.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="whitespace-normal">
                          {s.planName} <span className="text-muted-foreground">v{s.planVersion}</span>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          {formatDay(s.startsOn)} a {s.endsOn ? formatDay(s.endsOn) : "sem data de fim"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCents(s.amountCents)}</TableCell>
                        <TableCell className="text-right tabular-nums">{s.quota}</TableCell>
                        <TableCell>
                          <SubscriptionStatusBadge status={s.status} />
                        </TableCell>
                        {canManage ? (
                          <TableCell>
                            <SubscriptionStatusActions clientId={sel.id} id={s.id} status={s.status} name={`${s.planName} v${s.planVersion}`} />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Ciclos mensais</CardTitle>
              <CardDescription>Cota do mês copiada da assinatura. Ao encerrar, os números ficam gravados.</CardDescription>
            </div>
            {canManage && active ? (
              <OpenCycleDialog clientId={sel.id} subscriptionId={active.id} defaultYear={Number(today.slice(0, 4))} defaultMonth={Number(today.slice(5, 7))} defaultQuota={active.quota} firstCycle={first} />
            ) : null}
          </CardHeader>
          <CardContent>
            {planning.cycles.length === 0 ? (
              <EmptyState icon={Repeat} title="Nenhum ciclo aberto" description={active ? "Abra o ciclo do mês para planejar as peças." : "Crie uma assinatura ativa para poder abrir ciclos."} />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Ciclos de {sel.name}</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Competência</TableHead>
                      <TableHead scope="col" className="text-right">
                        Cota
                      </TableHead>
                      <TableHead scope="col" className="text-right">
                        Publicadas
                      </TableHead>
                      <TableHead scope="col" className="hidden md:table-cell text-right">
                        Progresso
                      </TableHead>
                      <TableHead scope="col">Situação</TableHead>
                      <TableHead scope="col">
                        <span className="sr-only">Ações</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {planning.cycles.map((c) => {
                      const p = planning.progress[c.id];
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="whitespace-normal font-medium">
                            {cycleLabel(c)}
                            {c.previousQuota !== null ? <div className="text-sm font-normal text-muted-foreground">Cota ajustada (era {c.previousQuota}): {c.quotaChangeReason}</div> : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{c.quota}</TableCell>
                          <TableCell className="text-right tabular-nums">{p ? `${p.published} de ${p.planned}` : "N/D"}</TableCell>
                          <TableCell className="hidden md:table-cell text-right tabular-nums">{p?.hasQuota ? formatPercent(p.percent) : "Sem cota"}</TableCell>
                          <TableCell>
                            <CycleStatusBadge status={c.status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2">
                              <Button asChild variant="ghost" size="sm">
                                <Link href={adminHref("/admin/contents", sel.id, { cycle: c.id })} aria-label={`Ver peças de ${cycleLabel(c)}`}>
                                  Ver peças
                                </Link>
                              </Button>
                              {canManage && c.status === "ABERTO" ? <AdjustQuotaDialog clientId={sel.id} cycleId={c.id} current={c.quota} label={cycleLabel(c)} /> : null}
                              {canManage ? <CycleActions clientId={sel.id} cycleId={c.id} status={c.status} label={cycleLabel(c)} /> : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
