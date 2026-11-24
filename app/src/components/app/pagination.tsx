import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { totalPages } from "@/lib/pagination";

function href(basePath: string, page: number, q?: string): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

/** Paginacao no servidor: links comuns (funcionam sem JavaScript), com a busca preservada. */
export function Pagination({ basePath, page, pageSize, total, q }: { basePath: string; page: number; pageSize: number; total: number; q?: string }) {
  const pages = totalPages(total, pageSize);
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Mostrando {from}–{to} de {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Button asChild variant="outline">
            <Link href={href(basePath, page - 1, q)} rel="prev">
              <ChevronLeft aria-hidden="true" /> Anterior
            </Link>
          </Button>
        ) : null}
        <span className="text-sm">
          Página {page} de {pages}
        </span>
        {page < pages ? (
          <Button asChild variant="outline">
            <Link href={href(basePath, page + 1, q)} rel="next">
              Próxima <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
