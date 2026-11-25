import { ScrollText, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Metadata } from "next";
import { AccountBadge, ClientStatusBadge, InvitationBadge } from "@/components/app/badges";
import { InviteDialog } from "@/components/app/invite-dialog";
import { MemberActions, RevokeInvitationButton } from "@/components/app/member-actions";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auditLabel } from "@/lib/audit-labels";
import { formatDate, formatDateTime } from "@/lib/formatting/date";
import { ROLE_LABEL } from "@/lib/schemas";
import { TIMEZONES } from "@/lib/timezones";
import { getDb } from "@/server/db/client";
import { requireStaffPageActor } from "@/server/page-session";
import { getClientDetail } from "@/server/services/clients";

export const metadata: Metadata = { title: "Cliente" };

// A URL so aponta o ALVO. getClientDetail confere no banco se esta pessoa pode ver este cliente
// (ADMIN, ou STAFF atribuido); id inexistente, malformado ou nao atribuido = a mesma tela "nao encontrada".
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const loaded = await guarded("/admin/clients", async () => {
    const actor = await requireStaffPageActor();
    const { id } = await params;
    const detail = await getClientDetail(getDb(), actor, id);
    const { client, members, staff, invitations, audit, permissions } = detail;
    const now = new Date();
    const tz = TIMEZONES.find((t) => t.value === client.timezone)?.label ?? client.timezone;

    return { client, members, staff, invitations, audit, permissions, now, tz };
  });
  if (!loaded.ok) return loaded.view;
  const { client, members, staff, invitations, audit, permissions, now, tz } = loaded.data;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Painel", href: "/admin" }, { label: "Clientes", href: "/admin/clients" }, { label: client.name }]}
        title={client.name}
        description={<ClientStatusBadge status={client.status} />}
        actions={permissions.canInvite && client.status === "ACTIVE" ? <InviteDialog clientId={client.id} clientName={client.name} /> : undefined}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Trabalho do cliente</CardTitle>
            <CardDescription>Plano, ciclos, peças, calendário e roteiros deste cliente.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2" aria-label="Módulos do cliente">
              {[["Assinaturas e ciclos", "/admin/subscriptions"], ["Conteúdos", "/admin/contents"], ["Calendário", "/admin/calendar"], ["Roteiros", "/admin/scripts"]].map(([label, path]) => (<li key={path}><Button asChild variant="outline"><Link href={path + "?client=" + client.id}>{label}</Link></Button></li>))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Dados do cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-sm text-muted-foreground">Contato</dt>
                <dd className="font-medium">{client.contactName ?? "N/D"}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">E-mail do contato</dt>
                <dd className="font-medium break-all">{client.contactEmail ?? "N/D"}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Fuso horário</dt>
                <dd className="font-medium">{tz}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Identificador</dt>
                <dd className="font-medium break-all">{client.slug}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Criado em</dt>
                <dd className="font-medium">{formatDate(client.createdAt, client.timezone)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Equipe da agência</dt>
                <dd className="font-medium">{staff.length === 0 ? "Ninguém atribuído" : staff.map((s) => s.user.name).join(", ")}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pessoas do cliente</CardTitle>
            <CardDescription>Quem tem acesso ao portal deste cliente.</CardDescription>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <EmptyState icon={Users} title="Ninguém com acesso ainda" description={permissions.canInvite ? "Convide a primeira pessoa para que ela possa entrar no portal." : "Ainda não há pessoas deste cliente com acesso."} />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Pessoas do cliente {client.name}</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Pessoa</TableHead>
                      <TableHead scope="col" className="hidden lg:table-cell">
                        Papel
                      </TableHead>
                      <TableHead scope="col">Situação</TableHead>
                      <TableHead scope="col" className="hidden lg:table-cell">
                        Último acesso
                      </TableHead>
                      {permissions.canManageMembers ? (
                        <TableHead scope="col" className="w-12">
                          <span className="sr-only">Ações</span>
                        </TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {members.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="min-w-[11rem] max-w-[16rem] whitespace-normal">
                          <div className="font-medium">{m.user.name}</div>
                          <div className="break-all text-sm text-muted-foreground">{m.user.email}</div>
                          <div className="text-sm text-muted-foreground lg:hidden">{ROLE_LABEL[m.role]}</div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{ROLE_LABEL[m.role]}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <AccountBadge blocked={m.user.banned} />
                            {m.status === "REVOKED" ? <Badge variant="secondary">Acesso revogado</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{m.user.lastLoginAt ? formatDateTime(m.user.lastLoginAt, client.timezone) : "Nunca entrou"}</TableCell>
                        {permissions.canManageMembers ? (
                          <TableCell>
                            <MemberActions clientId={client.id} memberId={m.id} name={m.user.name} blocked={m.user.banned} />
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

        {permissions.canInvite ? (
          <Card>
            <CardHeader>
              <CardTitle>Convites</CardTitle>
              <CardDescription>Convites de uso único, válidos por 7 dias. O link só é mostrado no momento da criação.</CardDescription>
            </CardHeader>
            <CardContent>
              {invitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum convite criado para este cliente.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <caption className="sr-only">Convites do cliente {client.name}</caption>
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">E-mail</TableHead>
                        <TableHead scope="col" className="hidden lg:table-cell">
                          Papel
                        </TableHead>
                        <TableHead scope="col">Situação</TableHead>
                        <TableHead scope="col" className="hidden md:table-cell">
                          Validade
                        </TableHead>
                        <TableHead scope="col" className="w-28">
                          <span className="sr-only">Ações</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitations.map((i) => {
                        const pending = !i.usedAt && !i.revokedAt && i.expiresAt.getTime() > now.getTime();
                        return (
                          <TableRow key={i.id}>
                            <TableCell className="min-w-[10rem] max-w-[16rem] whitespace-normal">
                                <div className="break-all">{i.email}</div>
                                <div className="text-sm text-muted-foreground lg:hidden">{ROLE_LABEL[i.role]}</div>
                              </TableCell>
                            <TableCell className="hidden lg:table-cell">{ROLE_LABEL[i.role]}</TableCell>
                            <TableCell>
                              <InvitationBadge usedAt={i.usedAt} revokedAt={i.revokedAt} expiresAt={i.expiresAt} now={now} />
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">{formatDate(i.expiresAt, client.timezone)}</TableCell>
                            <TableCell>
                              {pending && permissions.canRevokeInvitation ? <RevokeInvitationButton clientId={client.id} invitationId={i.id} email={i.email} /> : null}
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
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Atividade recente</CardTitle>
            <CardDescription>Últimos registros da auditoria deste cliente.</CardDescription>
          </CardHeader>
          <CardContent>
            {audit.length === 0 ? (
              <EmptyState icon={ScrollText} title="Sem atividade registrada" />
            ) : (
              <ul className="divide-y">
                {audit.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm">
                    <span className="font-medium">{auditLabel(a.action)}</span>
                    <time dateTime={a.createdAt.toISOString()} className="text-muted-foreground">
                      {formatDateTime(a.createdAt, client.timezone)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
