import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ContentStatusBadge } from "@/components/app/status-badges";
import { EmptyState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { buildMonthGrid, shiftMonth } from "@/lib/calendar-grid";
import { CONTENT_STATUS_CLIENT_LABEL, CONTENT_STATUS_LABEL, FORMAT_LABEL, WEEKDAYS_SHORT, competenceLabel, formatDay } from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface CalendarEntry {
  id: string;
  title: string;
  format: string;
  status: string;
  plannedOn: string;
}

/**
 * Calendario mensal (grade) e visao em lista equivalente. A grade vira lista em telas estreitas. Cada peca e um link
 * para o detalhe; o formato e o status aparecem em TEXTO. `renderAction` coloca acoes extras na lista (ex.: reagendar).
 */
export function CalendarView({
  year,
  month,
  items,
  view,
  hrefFor,
  navHref,
  audience,
  renderAction,
}: {
  year: number;
  month: number;
  items: CalendarEntry[];
  view: "grid" | "list";
  hrefFor: (id: string) => string;
  /** Monta o link de outro mes/visao mantendo os filtros. */
  navHref: (p: { year: number; month: number; view?: "grid" | "list" }) => string;
  audience: "agency" | "client";
  renderAction?: (item: CalendarEntry) => ReactNode;
}) {
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const weeks = buildMonthGrid(year, month, items);
  const statusLabel = (s: string) => (audience === "client" ? CONTENT_STATUS_CLIENT_LABEL : CONTENT_STATUS_LABEL)[s] ?? s;
  const sorted = [...items].sort((a, b) => (a.plannedOn === b.plannedOn ? a.title.localeCompare(b.title, "pt-BR") : a.plannedOn < b.plannedOn ? -1 : 1));

  const list = (
    <ul className="flex flex-col gap-2" aria-label={`Peças de ${competenceLabel(year, month)}`}>
      {sorted.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
          <div className="min-w-0">
            <Link href={hrefFor(i.id)} className="font-medium text-primary underline-offset-4 hover:underline">
              {i.title}
            </Link>
            <p className="text-sm text-muted-foreground">
              {formatDay(i.plannedOn)} · {FORMAT_LABEL[i.format] ?? i.format}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ContentStatusBadge status={i.status} audience={audience} />
            {renderAction ? renderAction(i) : null}
          </div>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon">
            <Link href={navHref({ ...prev })} aria-label="Mês anterior">
              <ChevronLeft aria-hidden="true" />
            </Link>
          </Button>
          <h2 className="min-w-[10rem] text-center text-lg font-semibold capitalize" aria-live="polite">
            {competenceLabel(year, month)}
          </h2>
          <Button asChild variant="outline" size="icon">
            <Link href={navHref({ ...next })} aria-label="Próximo mês">
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <div className="flex gap-2" role="group" aria-label="Tipo de visão">
          <Button asChild variant={view === "grid" ? "default" : "outline"} size="sm">
            <Link href={navHref({ year, month, view: "grid" })} aria-current={view === "grid" ? "true" : undefined}>
              Mês
            </Link>
          </Button>
          <Button asChild variant={view === "list" ? "default" : "outline"} size="sm">
            <Link href={navHref({ year, month, view: "list" })} aria-current={view === "list" ? "true" : undefined}>
              Lista
            </Link>
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nenhuma peça neste mês" description="Não há peças com data prevista em este mês e nos filtros escolhidos." />
      ) : view === "list" ? (
        list
      ) : (
        <>
          <div className="md:hidden">{list}</div>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full table-fixed border-collapse text-sm">
              <caption className="sr-only">Calendário de {competenceLabel(year, month)}</caption>
              <thead>
                <tr>
                  {WEEKDAYS_SHORT.map((d) => (
                    <th key={d} scope="col" className="border-b p-2 text-left font-medium text-muted-foreground">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={week[0].iso}>
                    {week.map((cell) => (
                      <td key={cell.iso} className={cn("relative h-28 overflow-hidden border-t border-l p-1.5 align-top first:border-l-0", !cell.inMonth && "bg-muted/40 text-muted-foreground")}>
                        <div className="mb-1 text-xs font-medium">
                          <span aria-hidden="true">{cell.day}</span>
                          <span className="sr-only">{formatDay(cell.iso)}</span>
                        </div>
                        <ul className="flex flex-col gap-1">
                          {cell.items.map((i) => (
                            <li key={i.id}>
                              <Link href={hrefFor(i.id)} className="block truncate rounded bg-secondary px-1.5 py-1 text-xs font-medium text-secondary-foreground hover:bg-accent" title={`${i.title} · ${FORMAT_LABEL[i.format] ?? i.format} · ${statusLabel(i.status)}`}>
                                {i.title}
                                <span className="sr-only">
                                  , {FORMAT_LABEL[i.format] ?? i.format}, {statusLabel(i.status)}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
