import { ExternalLink as ExternalIcon } from "lucide-react";

/** Link externo: abre em nova aba com rel seguro e mostra o DOMINIO. O servidor nunca busca nem pre-visualiza o endereco. */
export function ExternalLink({ href, label }: { href: string; label?: string }) {
  let host = "";
  let safe = false;
  try {
    const u = new URL(href);
    safe = u.protocol === "https:";
    host = u.hostname;
  } catch {
    safe = false;
  }
  if (!safe) return <span className="break-all text-muted-foreground">{href} (link não clicável)</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 break-all font-medium text-primary underline underline-offset-4">
      {label ?? "Abrir link"} <span className="font-normal text-muted-foreground">({host})</span>
      <ExternalIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">(abre em nova aba)</span>
    </a>
  );
}
