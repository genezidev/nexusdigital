import { Clapperboard } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { NoActiveClient } from "@/components/app/portal-gate";
import { EmptyState } from "@/components/app/states";
import { ScriptStatusBadge } from "@/components/app/status-badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDay } from "@/lib/labels";
import { parsePageParams } from "@/lib/pagination";
import { getDb } from "@/server/db/client";
import { scriptPortalOut } from "@/server/http/dto-fase2";
import { loadPortalScope, type SearchParams } from "@/server/page-data";
import { pageScriptsFor } from "@/server/services/queries";

export const metadata: Metadata = { title: "Roteiros" };

const crumbs = [{ label: "Início", href: "/portal" }, { label: "Roteiros" }];

// O cliente ve o roteiro a partir de ENVIADO (rascunho e interno: o repositorio e a RLS escondem).
export default async function PortalScriptsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const loaded = await guarded("/portal", async () => {
    const { page, pageSize } = parsePageParams(await searchParams);
    const scope = await loadPortalScope();
    if (!scope.active) return { scope, data: null };
    const r = await pageScriptsFor(getDb(), scope.active.ctx, { page, pageSize, sort: "createdAt", dir: "desc" });
    return { scope, data: { page, pageSize, items: r.items.map((i) => scriptPortalOut.parse(i)), total: r.total } };
  });
  if (!loaded.ok) return loaded.view;
  const { scope, data } = loaded.data;
  if (!scope.active || !data) return <NoActiveClient crumbs={crumbs} title="Roteiros" />;
  return (
    <>
      <PageHeader crumbs={crumbs} title="Roteiros" description="Roteiros enviados pela agência: instruções, PDF e envio da sua gravação." />
      {data.total === 0 ? (
        <EmptyState icon={Clapperboard} title="Nenhum roteiro enviado ainda" description="Quando a agência enviar um roteiro para você gravar, ele aparece aqui." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <caption className="sr-only">Roteiros enviados para você</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Roteiro</TableHead>
                  <TableHead scope="col">Prazo</TableHead>
                  <TableHead scope="col">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="max-w-[20rem] whitespace-normal">
                      <Link href={`/portal/scripts/${s.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                        {s.title}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDay(s.deadlineOn)}</TableCell>
                    <TableCell>
                      <ScriptStatusBadge status={s.status} audience="client" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination basePath="/portal/scripts" page={data.page} pageSize={data.pageSize} total={data.total} />
        </>
      )}
    </>
  );
}
