import { Package } from "lucide-react";
import type { Metadata } from "next";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { DeactivatePlanButton, PlanFormDialog } from "@/components/fase2/plan-forms";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/formatting/date";
import { formatCents } from "@/lib/formatting/money";
import { getDb } from "@/server/db/client";
import { planOut } from "@/server/http/dto-fase2";
import { requireStaffPageActor } from "@/server/page-session";
import { listCatalog } from "@/server/services/planning";

export const metadata: Metadata = { title: "Planos" };

// Catalogo da agencia (sem cliente). STAFF le; so o ADMIN cria, versiona e desativa (o servidor decide de novo na API).
export default async function PlansPage() {
  const loaded = await guarded("/admin", async () => {
    const actor = await requireStaffPageActor();
    const plans = (await listCatalog(getDb(), actor)).map((p) => planOut.parse(p));
    return { plans, isAdmin: actor.role === "ADMIN" };
  });
  if (!loaded.ok) return loaded.view;
  const { plans, isAdmin } = loaded.data;
  // Uma linha por codigo: a versao mais recente em destaque.
  const latest = new Map<string, number>();
  for (const p of plans) latest.set(p.code, Math.max(latest.get(p.code) ?? 0, p.version));

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Painel", href: "/admin" }, { label: "Planos" }]}
        title="Planos"
        description="Catálogo de serviços da agência. Plano publicado não é editado: mudanças criam uma nova versão e as assinaturas existentes continuam com a versão que contrataram."
        actions={isAdmin ? <PlanFormDialog mode="create" /> : undefined}
      />
      {plans.length === 0 ? (
        <EmptyState icon={Package} title="Nenhum plano cadastrado" description={isAdmin ? "Crie o primeiro plano para poder assinar clientes." : "Quando o administrador criar planos, eles aparecerão aqui."}>
          {isAdmin ? <PlanFormDialog mode="create" /> : null}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <caption className="sr-only">Catálogo de planos</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Plano</TableHead>
                <TableHead scope="col" className="text-right">
                  Valor mensal
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Cota
                </TableHead>
                <TableHead scope="col" className="hidden lg:table-cell text-right">
                  Revisões
                </TableHead>
                <TableHead scope="col" className="hidden lg:table-cell text-right">
                  Prazo (dias úteis)
                </TableHead>
                <TableHead scope="col">Situação</TableHead>
                {isAdmin ? (
                  <TableHead scope="col">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => {
                const isLatest = latest.get(p.code) === p.version;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="min-w-[12rem] whitespace-normal">
                      <div className="font-medium">
                        {p.name} <span className="text-muted-foreground">v{p.version}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {p.code} · criado em {formatDate(p.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCents(p.monthlyAmountCents)}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.monthlyQuota}</TableCell>
                    <TableCell className="hidden lg:table-cell text-right tabular-nums">{p.revisionsPerPiece}</TableCell>
                    <TableCell className="hidden lg:table-cell text-right tabular-nums">{p.approvalDeadlineBusinessDays}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={p.active ? "success" : "secondary"}>{p.active ? "Ativo" : "Desativado"}</Badge>
                        {!isLatest ? <Badge variant="outline">Versão anterior</Badge> : null}
                      </div>
                    </TableCell>
                    {isAdmin ? (
                      <TableCell>
                        <div className="flex gap-2">
                          {isLatest ? (
                            <PlanFormDialog
                              mode="version"
                              planId={p.id}
                              defaults={{
                                name: p.name,
                                amountText: (p.monthlyAmountCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                                quota: p.monthlyQuota,
                                revisions: p.revisionsPerPiece,
                                deadline: p.approvalDeadlineBusinessDays,
                                scope: p.scope,
                                exclusions: p.exclusions,
                              }}
                            />
                          ) : null}
                          {p.active ? <DeactivatePlanButton planId={p.id} name={`${p.name} v${p.version}`} /> : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
