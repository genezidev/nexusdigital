import { FileText, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { FilterForm, FilterSelect } from "@/components/app/client-scope-bar";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { NoActiveClient } from "@/components/app/portal-gate";
import { EmptyState } from "@/components/app/states";
import { ContentStatusBadge } from "@/components/app/status-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CONTENT_STATUS_CLIENT_LABEL, FORMAT_LABEL, formatDay } from "@/lib/labels";
import { contentListQuery } from "@/lib/schemas-fase2";
import { getDb } from "@/server/db/client";
import { contentPortalOut } from "@/server/http/dto-fase2";
import { loadPortalScope, one, type SearchParams } from "@/server/page-data";
import { pageContentsFor } from "@/server/services/queries";

export const metadata: Metadata = { title: "Conteúdos" };

const crumbs = [{ label: "Início", href: "/portal" }, { label: "Conteúdos" }];

// So o que a agencia compartilhou. A lista vem do servidor ja filtrada e sem campos internos.
export default async function PortalContentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const loaded = await guarded("/portal", async () => {
    const params = await searchParams;
    const scope = await loadPortalScope();
    if (!scope.active) return { scope, data: null };
    const parsed = contentListQuery.safeParse({ status: one(params, "status"), format: one(params, "format"), q: one(params, "q"), page: one(params, "page"), pageSize: 20, sort: "plannedOn" });
    const q = parsed.success ? parsed.data : contentListQuery.parse({});
    const r = await pageContentsFor(getDb(), scope.active.ctx, { page: q.page, pageSize: q.pageSize, dir: "desc", sort: q.sort, status: q.status, format: q.format, q: q.q });
    return { scope, data: { q, items: r.items.map((i) => contentPortalOut.parse(i)), total: r.total } };
  });
  if (!loaded.ok) return loaded.view;
  const { scope, data } = loaded.data;
  if (!scope.active || !data) return <NoActiveClient crumbs={crumbs} title="Conteúdos" />;
  const { q, items, total } = data;
  const filtered = !!(q.q || q.status || q.format);
  return (
    <>
      <PageHeader crumbs={crumbs} title="Conteúdos" description="Peças que a agência compartilhou com você, com prévia, legenda e histórico." />
      <FilterForm action="/portal/contents">
        <div className="flex min-w-[12rem] flex-1 flex-col gap-2 sm:max-w-xs">
          <Label htmlFor="q">Buscar pelo título</Label>
          <Input id="q" name="q" type="search" defaultValue={q.q ?? ""} maxLength={100} />
        </div>
        <FilterSelect name="status" label="Situação" value={q.status} options={Object.entries(CONTENT_STATUS_CLIENT_LABEL).map(([value, label]) => ({ value, label }))} />
        <FilterSelect name="format" label="Formato" value={q.format} options={Object.entries(FORMAT_LABEL).map(([value, label]) => ({ value, label }))} />
      </FilterForm>
      {total === 0 ? (
        filtered ? (
          <EmptyState icon={Search} title="Nenhuma peça encontrada" description="Nada corresponde aos filtros escolhidos.">
            <Button asChild variant="outline">
              <Link href="/portal/contents">Limpar filtros</Link>
            </Button>
          </EmptyState>
        ) : (
          <EmptyState icon={FileText} title="Nenhuma peça compartilhada ainda" description="Quando a agência compartilhar uma peça com você, ela aparece aqui." />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <caption className="sr-only">Conteúdos compartilhados com você</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Peça</TableHead>
                  <TableHead scope="col" className="hidden md:table-cell">
                    Formato
                  </TableHead>
                  <TableHead scope="col">Data prevista</TableHead>
                  <TableHead scope="col">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-[18rem] whitespace-normal">
                      <Link href={`/portal/contents/${c.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                        {c.title}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{FORMAT_LABEL[c.format] ?? c.format}</TableCell>
                    <TableCell>{formatDay(c.plannedOn)}</TableCell>
                    <TableCell>
                      <ContentStatusBadge status={c.status} audience="client" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination basePath="/portal/contents" page={q.page} pageSize={q.pageSize} total={total} q={q.q} params={{ status: q.status, format: q.format }} />
        </>
      )}
    </>
  );
}
