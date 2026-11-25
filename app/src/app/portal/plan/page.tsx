import { BadgeCheck } from "lucide-react";
import type { Metadata } from "next";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { NoActiveClient } from "@/components/app/portal-gate";
import { ProgressCard } from "@/components/app/progress-card";
import { EmptyState } from "@/components/app/states";
import { SubscriptionStatusBadge } from "@/components/app/status-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCents } from "@/lib/formatting/money";
import { competenceLabel, formatDay } from "@/lib/labels";
import { getDb } from "@/server/db/client";
import { cyclePortalOut, progressPortalOut, subscriptionPortalOut } from "@/server/http/dto-fase2";
import { loadPortalScope } from "@/server/page-data";
import { loadPortalPlan } from "@/server/services/queries";

export const metadata: Metadata = { title: "Meu plano" };

const crumbs = [{ label: "Início", href: "/portal" }, { label: "Meu plano" }];

// Plano e preco SO do retrato guardado na assinatura (nunca do catalogo da agencia); progresso so em numeros.
export default async function PortalPlanPage() {
  const loaded = await guarded("/portal", async () => {
    const scope = await loadPortalScope();
    if (!scope.active) return { scope, plan: null };
    const v = await loadPortalPlan(getDb(), scope.active.ctx);
    return {
      scope,
      plan: {
        subscription: v.subscription ? subscriptionPortalOut.parse(v.subscription) : null,
        cycle: v.cycle ? cyclePortalOut.parse(v.cycle) : null,
        progress: v.progress ? progressPortalOut.parse(v.progress) : null,
      },
    };
  });
  if (!loaded.ok) return loaded.view;
  const { scope, plan } = loaded.data;
  if (!scope.active || !plan) return <NoActiveClient crumbs={crumbs} title="Meu plano" />;
  const { subscription: sub, cycle, progress } = plan;

  if (!sub) {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Meu plano" />
        <EmptyState icon={BadgeCheck} title="Seu plano ainda não foi cadastrado" description="Assim que a agência registrar o seu plano, a vigência e o progresso do mês aparecem aqui." />
      </>
    );
  }
  const remaining = progress && progress.hasQuota ? Math.max(progress.quota - progress.published, 0) : null;
  return (
    <>
      <PageHeader crumbs={crumbs} title="Meu plano" description={scope.active.name} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {sub.planName} <SubscriptionStatusBadge status={sub.status} />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-sm text-muted-foreground">Vigência</dt>
                <dd className="font-medium">
                  {formatDay(sub.startsOn)} a {sub.endsOn ? formatDay(sub.endsOn) : "sem data de fim"}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Valor mensal</dt>
                <dd className="font-medium">{formatCents(sub.amountCents)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Publicações por mês</dt>
                <dd className="font-medium">{sub.quota}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Revisões por peça</dt>
                <dd className="font-medium">{sub.revisionsPerPiece}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Prazo para sua aprovação</dt>
                <dd className="font-medium">{sub.approvalDeadlineBusinessDays} dias úteis</dd>
              </div>
            </dl>
            <div>
              <h2 className="mb-1 text-base font-semibold">O que está incluído</h2>
              <p className="text-sm whitespace-pre-wrap">{sub.scopeSnapshot}</p>
            </div>
            {sub.exclusionsSnapshot ? (
              <div>
                <h2 className="mb-1 text-base font-semibold">O que não está incluído</h2>
                <p className="text-sm whitespace-pre-wrap">{sub.exclusionsSnapshot}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <ProgressCard
          title={cycle ? `Entregas de ${competenceLabel(cycle.year, cycle.month)}` : "Entregas do mês"}
          description="Publicações do mês em relação ao que o seu plano prevê."
          progress={progress}
        />
        {progress ? (
          <p className="text-sm text-muted-foreground" data-testid="plan-consumption">
            Entregas consumidas: {progress.published}. Restantes: {remaining === null ? "N/D (sem cota definida)" : remaining}.
          </p>
        ) : null}
      </div>
    </>
  );
}
