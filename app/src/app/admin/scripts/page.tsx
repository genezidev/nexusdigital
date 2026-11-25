import { Clapperboard, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ClientScopeBar, FilterForm, FilterSelect, NoClientSelected } from "@/components/app/client-scope-bar";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { EmptyState } from "@/components/app/states";
import { ScriptStatusBadge } from "@/components/app/status-badges";
import { ScriptFormDialog } from "@/components/fase2/script-forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminHref } from "@/lib/admin-links";
import { SCRIPT_STATUS_LABEL, formatDay } from "@/lib/labels";
import { scriptListQuery } from "@/lib/schemas-fase2";
import { can } from "@/server/authorization/permissions";
import { getDb } from "@/server/db/client";
import { scriptAgencyOut } from "@/server/http/dto-fase2";
import { loadAdminScope, loadAssignees, one, type SearchParams } from "@/server/page-data";
import { pageContentsFor, pageScriptsFor } from "@/server/services/queries";

export const metadata: Metadata = { title: "Roteiros" };

export default async function AdminScriptsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const loaded = await guarded("/admin", async () => {
    const params = await searchParams;
    const scope = await loadAdminScope(params);
    if (!scope.selected) return { scope, data: null };
    const ctx = scope.selected.ctx;
    const parsed = scriptListQuery.safeParse({ status: one(params, "status"), q: one(params, "q"), page: one(params, "page"), pageSize: 20, sort: "createdAt", dir: "desc" });
    const q = parsed.success ? parsed.data : scriptListQuery.parse({ dir: "desc" });
    const result = await pageScriptsFor(getDb(), ctx, { page: q.page, pageSize: q.pageSize, sort: q.sort, dir: q.dir, status: q.status, q: q.q });
    const contents = await pageContentsFor(getDb(), ctx, { page: 1, pageSize: 50, sort: "title", dir: "asc" });
    return {
      scope,
      data: {
        q,
        items: result.items.map((i) => scriptAgencyOut.parse(i)),
        total: result.total,
        assignees: await loadAssignees(ctx),
        contents: contents.items.map((c) => ({ id: c.id, title: c.title })),
        canWrite: can(ctx, "script:write"),
      },
    };
  });
  if (!loaded.ok) return loaded.view;
  const { scope, data } = loaded.data;
  const sel = scope.selected;
  const crumbs = [{ label: "Painel", href: "/admin" }, { label: "Roteiros" }];
  if (!sel || !data) {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Roteiros" description="Roteiros por cenas e gravações dos clientes." />
        <ClientScopeBar action="/admin/scripts" clients={scope.clients} />
        <NoClientSelected />
      </>
    );
  }
  const { q, items, total, assignees, contents, canWrite } = data;
  const filtered = !!(q.q || q.status);
  const dialog = canWrite ? <ScriptFormDialog clientId={sel.id} assignees={assignees} contents={contents} /> : undefined;
  return (
    <>
      <PageHeader crumbs={crumbs} title="Roteiros" description={`Cliente: ${sel.name}`} actions={dialog} />
      <ClientScopeBar action="/admin/scripts" clients={scope.clients} selectedId={sel.id} />
      <FilterForm action="/admin/scripts" clientId={sel.id}>
        <div className="flex min-w-[12rem] flex-1 flex-col gap-2 sm:max-w-xs">
          <Label htmlFor="q">Buscar pelo título</Label>
          <Input id="q" name="q" type="search" defaultValue={q.q ?? ""} maxLength={100} />
        </div>
        <FilterSelect name="status" label="Status" value={q.status} options={Object.entries(SCRIPT_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
      </FilterForm>
      {total === 0 ? (
        filtered ? (
          <EmptyState icon={Search} title="Nenhum roteiro encontrado" description="Nada corresponde aos filtros escolhidos.">
            <Button asChild variant="outline">
              <Link href={adminHref("/admin/scripts", sel.id)}>Limpar filtros</Link>
            </Button>
          </EmptyState>
        ) : (
          <EmptyState icon={Clapperboard} title="Nenhum roteiro criado" description="Crie o primeiro roteiro com cenas, instruções e prazo.">
            {dialog}
          </EmptyState>
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <caption className="sr-only">Roteiros de {sel.name}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Roteiro</TableHead>
                  <TableHead scope="col">Prazo</TableHead>
                  <TableHead scope="col">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="max-w-[20rem] whitespace-normal">
                      <Link href={adminHref(`/admin/scripts/${s.id}`, sel.id)} className="font-medium text-primary underline-offset-4 hover:underline">
                        {s.title}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDay(s.deadlineOn)}</TableCell>
                    <TableCell>
                      <ScriptStatusBadge status={s.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination basePath="/admin/scripts" page={q.page} pageSize={q.pageSize} total={total} q={q.q} params={{ client: sel.id, status: q.status }} />
        </>
      )}
    </>
  );
}
