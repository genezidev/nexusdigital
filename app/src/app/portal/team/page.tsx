import { Users } from "lucide-react";
import type { Metadata } from "next";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { NoActiveClient } from "@/components/app/portal-gate";
import { EmptyState } from "@/components/app/states";
import { RevokeTeamInvitationButton, TeamInviteDialog, TeamMemberActions } from "@/components/app/team-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime } from "@/lib/formatting/date";
import { ROLE_LABEL } from "@/lib/schemas";
import { getDb } from "@/server/db/client";
import { loadPortalScope } from "@/server/page-data";
import { loadTeam } from "@/server/services/team";

export const metadata: Metadata = { title: "Equipe" };

const crumbs = [{ label: "Início", href: "/portal" }, { label: "Equipe" }];

// So o dono do cliente (a pagina chama loadTeam, que confere `team:manage`: colaborador recebe "Acesso negado").
// O cliente e o da SESSAO; nada na URL escolhe o cliente.
export default async function PortalTeamPage() {
  const loaded = await guarded("/portal", async () => {
    const scope = await loadPortalScope();
    if (!scope.active) return { scope, team: null, now: new Date() };
    const now = new Date();
    return { scope, team: await loadTeam(getDb(), scope.active.ctx, now), now };
  });
  if (!loaded.ok) return loaded.view;
  const { scope, team } = loaded.data;
  if (!scope.active || !team) return <NoActiveClient crumbs={crumbs} title="Equipe" />;
  const tz = scope.active.timezone;

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        title="Equipe"
        description={`Quem da sua empresa tem acesso ao portal de ${scope.active.name}.`}
        actions={<TeamInviteDialog clientName={scope.active.name} />}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Pessoas com acesso</CardTitle>
            <CardDescription>Você convida e administra os colaboradores. Responsáveis do cliente só são criados pela agência.</CardDescription>
          </CardHeader>
          <CardContent>
            {team.members.length === 0 ? (
              <EmptyState icon={Users} title="Ninguém com acesso ainda" description="Convide a primeira pessoa da sua equipe." />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Pessoas com acesso ao portal</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">Pessoa</TableHead>
                      <TableHead scope="col" className="hidden md:table-cell">
                        Papel
                      </TableHead>
                      <TableHead scope="col">Situação</TableHead>
                      <TableHead scope="col" className="hidden lg:table-cell">
                        Último acesso
                      </TableHead>
                      <TableHead scope="col">Permissões</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {team.members.map((m) => (
                      <TableRow key={m.id} data-testid="team-member">
                        <TableCell className="min-w-[11rem] max-w-[16rem] whitespace-normal">
                          <div className="font-medium">
                            {m.name} {m.isSelf ? <span className="font-normal text-muted-foreground">(você)</span> : null}
                          </div>
                          <div className="break-all text-sm text-muted-foreground">{m.email}</div>
                          <div className="text-sm text-muted-foreground md:hidden">{ROLE_LABEL[m.role]}</div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{ROLE_LABEL[m.role]}</TableCell>
                        <TableCell>{m.status === "ACTIVE" ? <Badge variant="success">Ativo</Badge> : <Badge variant="secondary">Desativado</Badge>}</TableCell>
                        <TableCell className="hidden lg:table-cell">{m.lastLoginAt ? formatDateTime(m.lastLoginAt, tz) : "Nunca entrou"}</TableCell>
                        <TableCell className="min-w-[14rem] whitespace-normal">
                          {m.manageable ? (
                            <TeamMemberActions memberId={m.id} name={m.name} canApprove={m.canApprove} active={m.status === "ACTIVE"} />
                          ) : (
                            <span className="text-sm text-muted-foreground">{m.role === "CLIENT_OWNER" ? "Ver, comentar e aprovar (dono)" : "Gerenciado pela agência"}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Convites pendentes</CardTitle>
            <CardDescription>Convites de uso único, válidos por 7 dias. O link só é mostrado no momento da criação.</CardDescription>
          </CardHeader>
          <CardContent>
            {team.invitations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum convite pendente.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Convites pendentes</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">E-mail</TableHead>
                      <TableHead scope="col" className="hidden md:table-cell">
                        Permissões
                      </TableHead>
                      <TableHead scope="col" className="hidden md:table-cell">
                        Validade
                      </TableHead>
                      <TableHead scope="col" className="w-28">
                        <span className="sr-only">Ações</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {team.invitations.map((i) => (
                      <TableRow key={i.id} data-testid="team-invitation">
                        <TableCell className="min-w-[10rem] max-w-[16rem] whitespace-normal break-all">{i.email}</TableCell>
                        <TableCell className="hidden md:table-cell">{i.canApprove ? "Ver, comentar e aprovar" : "Ver e comentar"}</TableCell>
                        <TableCell className="hidden md:table-cell">{formatDate(i.expiresAt, tz)}</TableCell>
                        <TableCell>{i.revocable ? <RevokeTeamInvitationButton invitationId={i.id} email={i.email} /> : null}</TableCell>
                      </TableRow>
                    ))}
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
