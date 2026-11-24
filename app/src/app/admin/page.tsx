import { Building2, Mail, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { CreateClientDialog } from "@/components/app/create-client-dialog";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { auditLabel } from "@/lib/audit-labels";
import { formatDateTime } from "@/lib/formatting/date";
import { getDb } from "@/server/db/client";
import { requireStaffPageActor } from "@/server/page-session";
import { getAdminOverview } from "@/server/services/clients";

export const metadata: Metadata = { title: "Painel" };

function Stat({ icon: Icon, label, value, hint }: { icon: typeof Building2; label: string; value: number; hint: string }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4" aria-hidden="true" /> {label}
        </CardDescription>
        <p className="text-3xl font-bold tabular-nums">{value}</p>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}

export default async function AdminHome() {
  const loaded = await guarded("/", async () => {
    const actor = await requireStaffPageActor();
    return getAdminOverview(getDb(), actor);
  });
  if (!loaded.ok) return loaded.view;
  const overview = loaded.data;
  {

    if (overview.kind === "STAFF") {
      return (
        <>
          <PageHeader crumbs={[{ label: "Painel" }]} title="Painel" description="Clientes atribuídos a você." />
          {overview.clients.length === 0 ? (
            <EmptyState icon={Building2} title="Nenhum cliente atribuído" description="Quando o administrador atribuir clientes a você, eles aparecerão aqui." />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Seus clientes ({overview.clientsTotal})</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {overview.clients.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                      <span className="font-medium">{c.name}</span>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/admin/clients/${c.id}`}>Abrir</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      );
    }

    return (
      <>
        <PageHeader
          crumbs={[{ label: "Painel" }]}
          title="Painel"
          description="Visão geral da agência."
          actions={<CreateClientDialog />}
        />
        {overview.clientsTotal === 0 ? (
          <EmptyState icon={Building2} title="Nenhum cliente cadastrado" description="Cadastre o primeiro cliente para convidar as pessoas dele.">
            <CreateClientDialog label="Criar primeiro cliente" />
          </EmptyState>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Stat icon={Building2} label="Clientes ativos" value={overview.clientsActive} hint={`${overview.clientsTotal} no total`} />
              <Stat icon={Mail} label="Convites pendentes" value={overview.pendingInvitations} hint="Ainda não usados e dentro da validade" />
              <Stat icon={ShieldAlert} label="Contas bloqueadas" value={overview.blockedAccounts} hint="Sem acesso até serem desbloqueadas" />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Atividade recente</CardTitle>
                <CardDescription>Últimos registros da auditoria.</CardDescription>
              </CardHeader>
              <CardContent>
                {overview.recent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
                ) : (
                  <ul className="divide-y">
                    {overview.recent.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                        <span>
                          <strong className="font-medium">{auditLabel(a.action)}</strong>
                          {a.client ? <span className="text-muted-foreground"> · {a.client.name}</span> : null}
                        </span>
                        <time dateTime={a.createdAt.toISOString()} className="text-muted-foreground">
                          {formatDateTime(a.createdAt)}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
                <Button asChild variant="link" className="mt-2 px-0">
                  <Link href="/admin/audit">Ver toda a auditoria</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </>
    );
  }
}
