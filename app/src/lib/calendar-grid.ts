// Grade do calendario mensal (apresentacao pura, sem relogio nem fuso): semanas de domingo a sabado.

export interface CalendarCell<T> {
  /** AAAA-MM-DD */
  iso: string;
  day: number;
  inMonth: boolean;
  items: T[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Mes anterior e seguinte, com virada de ano. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Monta as semanas do mes e distribui as pecas pelo dia previsto (`plannedOn` = AAAA-MM-DD). */
export function buildMonthGrid<T extends { plannedOn: string }>(year: number, month: number, items: readonly T[]): CalendarCell<T>[][] {
  const byDay = new Map<string, T[]>();
  for (const item of items) {
    const list = byDay.get(item.plannedOn) ?? [];
    list.push(item);
    byDay.set(item.plannedOn, list);
  }
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = domingo
  const total = daysInMonth(year, month);
  const cells: CalendarCell<T>[] = [];
  const prev = shiftMonth(year, month, -1);
  const prevDays = daysInMonth(prev.year, prev.month);
  for (let i = first - 1; i >= 0; i--) {
    const d = prevDays - i;
    cells.push({ iso: isoOf(prev.year, prev.month, d), day: d, inMonth: false, items: [] });
  }
  for (let d = 1; d <= total; d++) {
    const iso = isoOf(year, month, d);
    cells.push({ iso, day: d, inMonth: true, items: byDay.get(iso) ?? [] });
  }
  const next = shiftMonth(year, month, 1);
  for (let d = 1; cells.length % 7 !== 0; d++) cells.push({ iso: isoOf(next.year, next.month, d), day: d, inMonth: false, items: [] });
  const weeks: CalendarCell<T>[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
