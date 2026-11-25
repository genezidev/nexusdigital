import { FileText, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ClientScopeBar, FilterForm, FilterSelect, NoClientSelected } from "@/components/app/client-scope-bar";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { EmptyState } from "@/components/app/states";
import { ContentStatusBadge, OverdueBadge, VisibilityBadge } from "@/components/app/status-badges";
import { NewContentDialog } from "@/components/fase2/content-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminHref } from "@/lib/admin-links";
import { CONTENT_STATUS_LABEL, FORMAT_LABEL, competenceLabel, formatDay, isOverdue, todayIsoIn } from "@/lib/labels";
import { contentListQuery } from "@/lib/schemas-fase2";
import { can } from "@/server/authorization/permissions";
import { getDb } from "@/server/db/client";
import { contentAgencyOut } from "@/server/http/dto-fase2";
import { loadAdminScope, loadAssignees, loadOpenCycles, one, type SearchParams } from "@/server/page-data";
import { pageContentsFor } from "@/server/services/queries";

export const metadata: Metadata = { title: "Conteúdos" };

export default async function AdminContentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const loaded = await guarded("/admin", async () => {
    const params = await searchParams;
    const scope = await loadAdminScope(params);
    if (!scope.selected) return { scope, data: null };
    const ctx = scope.selected.ctx;
    // Filtros invalidos na URL caem no padrao (nunca 500).
    const parsed = contentListQuery.safeParse({ status: one(params, "status"), format: one(params, "format"), cycleId: one(params, "cycle"), q: one(params, "q"), page: one(params, "page"), pageSize: 20 });
    const q = parsed.success ? parsed.data : contentListQuery.parse({});
    const result = await pageContentsFor(getDb(), ctx, { page: q.page, pageSize: q.pageSize, dir: q.dir, sort: q.sort, status: q.status, format: q.format, cycleId: q.cycleId, q: q.q });
    const cycles = await loadOpenCycles(ctx);
    const assignees = await loadAssignees(ctx);
    return {
      scope,
      data: {
        q,
        items: result.items.map((i) => contentAgencyOut.parse(i)),
        total: result.total,
        cycles,
        assignees,
        canWrite: can(ctx, "content:write"),
        today: todayIsoIn(scope.selected.timezone, new Date()),
      },
    };
  });
  if (!loaded.ok) return loaded.view;
  const { scope, data } = loaded.data;
  const sel = scope.selected;
  const crumbs = [{ label: "Painel", href: "/admin" }, { label: "Conteúdos" }];
  if (!sel || !data) {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Conteúdos" description="Peças planejadas, em produção, em aprovação e publicadas." />
        <ClientScopeBar action="/admin/contents" clients={scope.clients} />
        <NoClientSelected />
      </>
    );
  }
  const { q, items, total, cycles, assignees, canWrite, today } = data;
  const cycleOptions = cycles.map((c) => ({ id: c.id, label: competenceLabel(c.year, c.month) }));
  const filtered = !!(q.q || q.status || q.format || q.cycleId);
  const extra = { client: sel.id, status: q.status, format: q.format, cycle: q.cycleId };

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        title="Conteúdos"
        description={`Cliente: ${sel.name}`}
        actions={canWrite ? <NewContentDialog clientId={sel.id} cycles={cycleOptions} assignees={assignees} /> : undefined}
      />
      <ClientScopeBar action="/admin/contents" clients={scope.clients} selectedId={sel.id} />
      <FilterForm action="/admin/contents" clientId={sel.id}>
        <div className="flex min-w-[12rem] flex-1 flex-col gap-2 sm:max-w-xs">
          <Label htmlFor="q">Buscar pelo título</Label>
          <Input id="q" name="q" type="search" defaultValue={q.q ?? ""} maxLength={100} />
        </div>
        <FilterSelect name="status" label="Status" value={q.status} options={Object.entries(CONTENT_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
        <FilterSelect name="format" label="Formato" value={q.format} options={Object.entries(FORMAT_LABEL).map(([value, label]) => ({ value, label }))} />
      </FilterForm>

      {total === 0 ? (
        filtered ? (
          <EmptyState icon={Search} title="Nenhuma peça encontrada" description="Nada corresponde aos filtros escolhidos.">
            <Button asChild variant="outline">
              <Link href={adminHref("/admin/contents", sel.id)}>Limpar filtros</Link>
            </Button>
          </EmptyState>
        ) : (
          <EmptyState icon={FileText} title="Nenhuma peça planejada" description={cycles.length === 0 ? "Abra um ciclo em “Assinaturas e ciclos” para poder planejar peças." : "Planeje a primeira peça do mês."}>
            {canWrite && cycles.length > 0 ? <NewContentDialog clientId={sel.id} cycles={cycleOptions} assignees={assignees} /> : null}
          </EmptyState>
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <caption className="sr-only">Conteúdos de {sel.name}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Peça</TableHead>
                  <TableHead scope="col" className="hidden md:table-cell">
                    Formato
                  </TableHead>
                  <TableHead scope="col">Data prevista</TableHead>
                  <TableHead scope="col">Status</TableHead>
                  <TableHead scope="col" className="hidden lg:table-cell">
                    Visibilidade
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-[18rem] whitespace-normal">
                      <Link href={adminHref(`/admin/contents/${c.id}`, sel.id)} className="font-medium text-primary underline-offset-4 hover:underline">
                        {c.title}
                      </Link>
                      <div className="text-sm text-muted-foreground md:hidden">{FORMAT_LABEL[c.format] ?? c.format}</div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{FORMAT_LABEL[c.format] ?? c.format}</TableCell>
                    <TableCell>{formatDay(c.plannedOn)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <ContentStatusBadge status={c.status} />
                        {isOverdue(c.plannedOn, c.status, today) ? <OverdueBadge /> : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <VisibilityBadge visibility={c.visibility} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination basePath="/admin/contents" page={q.page} pageSize={q.pageSize} total={total} q={q.q} params={extra} />
        </>
      )}
    </>
  );
}
