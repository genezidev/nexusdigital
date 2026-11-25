import type { Metadata } from "next";
import { CalendarView } from "@/components/app/calendar-view";
import { ClientScopeBar, FilterForm, FilterSelect, NoClientSelected } from "@/components/app/client-scope-bar";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { RescheduleDialog } from "@/components/fase2/content-actions";
import { adminHref } from "@/lib/admin-links";
import { daysInMonth } from "@/lib/calendar-grid";
import { CONTENT_STATUS_LABEL, FORMAT_LABEL, todayIsoIn } from "@/lib/labels";
import { calendarQuery } from "@/lib/schemas-fase2";
import { can } from "@/server/authorization/permissions";
import { getDb } from "@/server/db/client";
import { calendarItemOut } from "@/server/http/dto-fase2";
import { loadAdminScope, one, type SearchParams } from "@/server/page-data";
import { calendarFor } from "@/server/services/queries";

export const metadata: Metadata = { title: "Calendário" };

export default async function AdminCalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const loaded = await guarded("/admin", async () => {
    const params = await searchParams;
    const scope = await loadAdminScope(params);
    if (!scope.selected) return { scope, data: null };
    const today = todayIsoIn(scope.selected.timezone, new Date());
    const parsed = calendarQuery.safeParse({
      year: one(params, "year") ?? today.slice(0, 4),
      month: one(params, "month") ?? today.slice(5, 7),
      format: one(params, "format"),
      status: one(params, "status"),
    });
    const q = parsed.success ? parsed.data : calendarQuery.parse({ year: today.slice(0, 4), month: today.slice(5, 7) });
    const items = (await calendarFor(getDb(), scope.selected.ctx, q)).map((i) => calendarItemOut.parse(i));
    return { scope, data: { q, items, view: one(params, "view") === "list" ? ("list" as const) : ("grid" as const), canWrite: can(scope.selected.ctx, "content:write") } };
  });
  if (!loaded.ok) return loaded.view;
  const { scope, data } = loaded.data;
  const sel = scope.selected;
  const crumbs = [{ label: "Painel", href: "/admin" }, { label: "Calendário" }];
  if (!sel || !data) {
    return (
      <>
        <PageHeader crumbs={crumbs} title="Calendário" description="Peças por data prevista, em grade mensal ou em lista." />
        <ClientScopeBar action="/admin/calendar" clients={scope.clients} />
        <NoClientSelected />
      </>
    );
  }
  const { q, items, view, canWrite } = data;
  const pad = (n: number) => String(n).padStart(2, "0");
  const min = `${q.year}-${pad(q.month)}-01`;
  const max = `${q.year}-${pad(q.month)}-${pad(daysInMonth(q.year, q.month))}`;

  return (
    <>
      <PageHeader crumbs={crumbs} title="Calendário" description={`Cliente: ${sel.name}`} />
      <ClientScopeBar action="/admin/calendar" clients={scope.clients} selectedId={sel.id} />
      <FilterForm action="/admin/calendar" clientId={sel.id}>
        <input type="hidden" name="year" value={q.year} />
        <input type="hidden" name="month" value={q.month} />
        <input type="hidden" name="view" value={view} />
        <FilterSelect name="format" label="Formato" value={q.format} options={Object.entries(FORMAT_LABEL).map(([value, label]) => ({ value, label }))} />
        <FilterSelect name="status" label="Status" value={q.status} options={Object.entries(CONTENT_STATUS_LABEL).map(([value, label]) => ({ value, label }))} />
      </FilterForm>
      <CalendarView
        year={q.year}
        month={q.month}
        items={items}
        view={view}
        audience="agency"
        hrefFor={(id) => adminHref(`/admin/contents/${id}`, sel.id)}
        navHref={(p) => adminHref("/admin/calendar", sel.id, { year: p.year, month: p.month, view: p.view ?? view, format: q.format, status: q.status })}
        renderAction={
          canWrite
            ? (i) =>
                i.status === "CANCELADO" || i.status === "PUBLICADO" || i.status === "ANALISADO" ? null : (
                  <RescheduleDialog clientId={sel.id} contentId={i.id} current={i.plannedOn} min={min} max={max} name={i.title} />
                )
            : undefined
        }
      />
    </>
  );
}
