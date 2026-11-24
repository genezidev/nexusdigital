export interface PageParams {
  page: number;
  pageSize: number;
  q: string | undefined;
}

type Source = URLSearchParams | Record<string, string | string[] | undefined>;

function pick(source: Source, key: string): string | undefined {
  if (source instanceof URLSearchParams) return source.get(key) ?? undefined;
  const value = source[key];
  return Array.isArray(value) ? value[0] : value;
}

/** Le page, pageSize e q da URL com limites seguros. Valor invalido cai no padrao (nunca 500). */
export function parsePageParams(source: Source, defaults = { pageSize: 10 }): PageParams {
  const page = Number.parseInt(pick(source, "page") ?? "", 10);
  const size = Number.parseInt(pick(source, "pageSize") ?? "", 10);
  const q = pick(source, "q")?.trim().slice(0, 100);
  return {
    page: Number.isFinite(page) && page >= 1 && page <= 100_000 ? page : 1,
    pageSize: Number.isFinite(size) && size >= 1 && size <= 50 ? size : defaults.pageSize,
    q: q ? q : undefined,
  };
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
