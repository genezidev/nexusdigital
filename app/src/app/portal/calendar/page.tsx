import type { Metadata } from "next";
import { CalendarView } from "@/components/app/calendar-view";
import { FilterForm, FilterSelect } from "@/components/app/client-scope-bar";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { NoActiveClient } from "@/components/app/portal-gate";
import { CONTENT_STATUS_CLIENT_LABEL, FORMAT_LABEL, todayIsoIn } from "@/lib/labels";
import { calendarQuery } from "@/lib/schemas-fase2";
import { getDb } from "@/server/db/client";
import { calendarItemOut } from "@/server/http/dto-fase2";
import { loadPortalScope, one, type SearchParams } from "@/server/page-data";
import { calendarFor } from "@/server/services/queries";

export const metadata: Metadata = { title: "Calendário" };

const crumbs = [{ label: "Início", href: "/portal" }, { label: "Calendário" }];

export default async function PortalCalendarPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const loaded = await guarded("/portal", async () => {
    const params = await searchParams;
    const scope = await loadPortalScope();
    if (!scope.active) return { scope, data: null };
    const today = todayIsoIn(scope.active.timezone, new Date());
    const parsed = calendarQuery.safeParse({ year: one(params, "year") ?? today.slice(0, 4), month: one(params, "month") ?? today.slice(5, 7), format: one(params, "format"), status: one(params, "status") });
    const q = parsed.success ? parsed.data : calendarQuery.parse({ year: today.slice(0, 4), month: today.slice(5, 7) });
    const items = (await calendarFor(getDb(), scope.active.ctx, q)).map((i) => calendarItemOut.parse(i));
    return { scope, data: { q, items, view: one(params, "view") === "list" ? ("list" as const) : ("grid" as const) } };
  });
  if (!loaded.ok) return loaded.view;
  const { scope, data } = loaded.data;
  if (!scope.active || !data) return <NoActiveClient crumbs={crumbs} title="Calendário" />;
  const { q, items, view } = data;
  const qs = (p: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== "") u.set(k, String(v));
    return `/portal/calendar?${u.toString()}`;
  };
  return (
    <>
      <PageHeader crumbs={crumbs} title="Calendário" description="Peças compartilhadas com você, por data prevista." />
      <FilterForm action="/portal/calendar">
        <input type="hidden" name="year" value={q.year} />
        <input type="hidden" name="month" value={q.month} />
        <input type="hidden" name="view" value={view} />
        <FilterSelect name="format" label="Formato" value={q.format} options={Object.entries(FORMAT_LABEL).map(([value, label]) => ({ value, label }))} />
        <FilterSelect name="status" label="Situação" value={q.status} options={Object.entries(CONTENT_STATUS_CLIENT_LABEL).map(([value, label]) => ({ value, label }))} />
      </FilterForm>
      <CalendarView
        year={q.year}
        month={q.month}
        items={items}
        view={view}
        audience="client"
        hrefFor={(id) => `/portal/contents/${id}`}
        navHref={(p) => qs({ year: p.year, month: p.month, view: p.view ?? view, format: q.format, status: q.status })}
      />
    </>
  );
}
