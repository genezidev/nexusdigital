import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { AccessDenied } from "@/components/app/states";
import { ForbiddenError, NotFoundError } from "@/server/errors";

/**
 * Converte erros esperados de autorizacao em estados de tela, sem stack trace:
 * 403 -> "Acesso negado"; 404 -> pagina nao encontrada (mesma tela para "nao existe" e "nao e seu").
 * Qualquer outro erro continua subindo para o error.tsx do segmento.
 */
export function pageError(error: unknown, homeHref: string): ReactElement {
  if (error instanceof ForbiddenError) return <AccessDenied homeHref={homeHref} />;
  if (error instanceof NotFoundError) notFound();
  throw error;
}

export type Guarded<T> = { ok: true; data: T } | { ok: false; view: ReactElement };

/**
 * Executa o carregamento da pagina e transforma erro esperado de autorizacao em tela (sem JSX dentro do
 * try, como o React exige). redirect() e notFound() passam adiante; erro inesperado vai para o error.tsx.
 */
export async function guarded<T>(homeHref: string, load: () => Promise<T>): Promise<Guarded<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    return { ok: false, view: pageError(error, homeHref) };
  }
}
