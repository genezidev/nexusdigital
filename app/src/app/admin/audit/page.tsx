import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { EmptyState } from "@/components/app/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { auditLabel } from "@/lib/audit-labels";
import { formatDateTime } from "@/lib/formatting/date";
import { parsePageParams } from "@/lib/pagination";
import { getDb } from "@/server/db/client";
import { requireAdminPageActor } from "@/server/page-session";
import { getAuditPageForAdmin } from "@/server/services/clients";

export const metadata: Metadata = { title: "Auditoria" };

// Auditoria entre clientes: so ADMIN. O diff nunca e exibido nem consultado aqui.
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const loaded = await guarded("/admin", async () => {
    const actor = await requireAdminPageActor();
    const { page, pageSize } = parsePageParams(await searchParams, { pageSize: 25 });
    const result = await getAuditPageForAdmin(getDb(), actor, { page, pageSize });

    return { result };
  });
  if (!loaded.ok) return loaded.view;
  const { result } = loaded.data;

  return (
    <>
      <PageHeader crumbs={[{ label: "Painel", href: "/admin" }, { label: "Auditoria" }]} title="Auditoria" description="Registro de ações sensíveis, do mais recente para o mais antigo." />
      {result.total === 0 ? (
        <EmptyState icon={ScrollText} title="Nenhum registro ainda" description="As ações de administração (criar cliente, convidar, bloquear) aparecem aqui." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <caption className="sr-only">Registros de auditoria</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Quando</TableHead>
                  <TableHead scope="col">Ação</TableHead>
                  <TableHead scope="col" className="hidden sm:table-cell">
                    Cliente
                  </TableHead>
                  <TableHead scope="col" className="hidden md:table-cell">
                    Quem
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">
                      <time dateTime={a.createdAt.toISOString()}>{formatDateTime(a.createdAt)}</time>
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <span className="font-medium">{auditLabel(a.action)}</span>
                      <div className="text-sm text-muted-foreground sm:hidden">{a.client?.name ?? "—"}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{a.client?.name ?? "—"}</TableCell>
                    <TableCell className="hidden break-all whitespace-normal md:table-cell">{a.actor?.email ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination basePath="/admin/audit" page={result.page} pageSize={result.pageSize} total={result.total} />
        </>
      )}
    </>
  );
}
