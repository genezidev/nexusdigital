import { Building2, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ClientStatusBadge } from "@/components/app/badges";
import { CreateClientDialog } from "@/components/app/create-client-dialog";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/formatting/date";
import { parsePageParams } from "@/lib/pagination";
import { TIMEZONES } from "@/lib/timezones";
import { getDb } from "@/server/db/client";
import { requireStaffPageActor } from "@/server/page-session";
import { listClientsForActor } from "@/server/services/clients";

export const metadata: Metadata = { title: "Clientes" };

const tzLabel = (tz: string) => TIMEZONES.find((t) => t.value === tz)?.label ?? tz;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const loaded = await guarded("/", async () => {
    const actor = await requireStaffPageActor();
    const { page, pageSize, q } = parsePageParams(await searchParams);
    const result = await listClientsForActor(getDb(), actor, { page, pageSize, q });
    const isAdmin = actor.role === "ADMIN";

    return { q, result, isAdmin };
  });
  if (!loaded.ok) return loaded.view;
  const { q, result, isAdmin } = loaded.data;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Painel", href: "/admin" }, { label: "Clientes" }]}
        title="Clientes"
        description={isAdmin ? "Empresas atendidas pela agência." : "Clientes atribuídos a você."}
        actions={isAdmin ? <CreateClientDialog /> : undefined}
      />

      <form action="/admin/clients" method="get" role="search" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-sm">
          <Label htmlFor="q">Buscar cliente</Label>
          <Input id="q" name="q" type="search" defaultValue={q ?? ""} placeholder="Nome, e-mail ou identificador" maxLength={100} />
        </div>
        <Button type="submit" variant="outline">
          <Search aria-hidden="true" /> Buscar
        </Button>
        {q ? (
          <Button asChild variant="ghost">
            <Link href="/admin/clients">Limpar busca</Link>
          </Button>
        ) : null}
      </form>

      {result.total === 0 ? (
        q ? (
          <EmptyState icon={Search} title="Nenhum cliente encontrado" description={`Nada corresponde a "${q}". Confira a grafia ou limpe a busca.`}>
            <Button asChild variant="outline">
              <Link href="/admin/clients">Limpar busca</Link>
            </Button>
          </EmptyState>
        ) : isAdmin ? (
          <EmptyState icon={Building2} title="Nenhum cliente cadastrado" description="Cadastre o primeiro cliente para convidar as pessoas dele.">
            <CreateClientDialog label="Criar primeiro cliente" />
          </EmptyState>
        ) : (
          <EmptyState icon={Building2} title="Nenhum cliente atribuído" description="Quando o administrador atribuir clientes a você, eles aparecerão aqui." />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <caption className="sr-only">Lista de clientes</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Cliente</TableHead>
                  <TableHead scope="col" className="hidden md:table-cell">
                    Fuso horário
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Pessoas
                  </TableHead>
                  <TableHead scope="col">Situação</TableHead>
                  <TableHead scope="col" className="hidden lg:table-cell">
                    Criado em
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-[16rem] whitespace-normal">
                      <Link href={`/admin/clients/${c.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                        {c.name}
                      </Link>
                      {c.contactEmail ? <div className="truncate text-sm text-muted-foreground">{c.contactEmail}</div> : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{tzLabel(c.timezone)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c._count.members}</TableCell>
                    <TableCell>
                      <ClientStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{formatDate(c.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination basePath="/admin/clients" page={result.page} pageSize={result.pageSize} total={result.total} q={q} />
        </>
      )}
    </>
  );
}
