import { Building2, Info } from "lucide-react";
import type { Metadata } from "next";
import { ClientPicker } from "@/components/app/client-picker";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABEL } from "@/lib/schemas";
import { TIMEZONES } from "@/lib/timezones";
import { resolveTenantContext } from "@/server/authorization/context";
import { getDb } from "@/server/db/client";
import { getMyClients, requireClientPageActor } from "@/server/page-session";
import { loadPortalHome } from "@/server/services/portal";

export const metadata: Metadata = { title: "Início" };

// O cliente mostrado vem SEMPRE de resolveTenantContext(sessao). Nenhum parametro de URL escolhe cliente.
export default async function PortalHome() {
  const loaded = await guarded("/", async () => {
    const actor = await requireClientPageActor();
    const clients = await getMyClients(actor.userId);
    const active = clients.find((c) => c.id === actor.activeClientId) ?? null;
    if (!active) return { actor, clients, active: null, home: null, memberRole: null };
    const db = getDb();
    const ctx = await resolveTenantContext(db, { userId: actor.userId, activeClientId: actor.activeClientId });
    const home = await loadPortalHome(db, ctx);
    return { actor, clients, active, home, memberRole: ctx.memberRole };
  });
  if (!loaded.ok) return loaded.view;
  const { actor, clients, active, home, memberRole } = loaded.data;
  const crumbs = [{ label: "Início" }];

  if (clients.length === 0) {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Início" />
        <EmptyState
          icon={Building2}
          title="Você não tem acesso a nenhum cliente no momento"
          description="Seu acesso pode ter sido encerrado ou o cliente está inativo. Fale com o administrador da agência."
        />
      </>
    );
  }

  if (!active || !home) {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Início" description="Escolha o cliente para começar." />
        <ClientPicker clients={clients} />
      </>
    );
  }

  const tz = TIMEZONES.find((t) => t.value === home.client.timezone)?.label ?? home.client.timezone;
  return (
    <>
      <PageHeader crumbs={crumbs} title={`Olá, ${actor.name.split(" ")[0]}`} description={`Você está em ${home.client.name} como ${ROLE_LABEL[active.role].toLowerCase()}.`} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Seu cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-sm text-muted-foreground">Empresa</dt>
                <dd className="font-medium">{home.client.name}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Contato</dt>
                <dd className="font-medium">{home.client.contactName ?? "N/D"}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Fuso horário</dt>
                <dd className="font-medium">{tz}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {memberRole === "CLIENT_OWNER" ? (
          <Card>
            <CardHeader>
              <CardTitle>Pessoas com acesso</CardTitle>
              <CardDescription>Quem da sua empresa entra neste portal.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Pessoas com acesso a {home.client.name}</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Pessoa</TableHead>
                      <TableHead scope="col">Papel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {home.team.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-normal">
                          <div className="font-medium">{m.name}</div>
                          <div className="break-all text-sm text-muted-foreground">{m.email}</div>
                        </TableCell>
                        <TableCell className="whitespace-normal">{ROLE_LABEL[m.role]}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm text-muted-foreground" role="note">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p>Planejamento, conteúdos, relatórios e financeiro chegam nas próximas fases. Por enquanto, esta é a sua área de acesso.</p>
        </div>
      </div>
    </>
  );
}
