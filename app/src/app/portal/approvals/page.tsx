import { ClipboardCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { Pagination } from "@/components/app/pagination";
import { NoActiveClient } from "@/components/app/portal-gate";
import { EmptyState } from "@/components/app/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FORMAT_LABEL, formatDay } from "@/lib/labels";
import { parsePageParams } from "@/lib/pagination";
import { getDb } from "@/server/db/client";
import { contentPortalOut } from "@/server/http/dto-fase2";
import { loadPortalScope, type SearchParams } from "@/server/page-data";
import { pageContentsFor } from "@/server/services/queries";

export const metadata: Metadata = { title: "Aprovações" };

const crumbs = [{ label: "Início", href: "/portal" }, { label: "Aprovações" }];

// Fila de pendencias: so pecas AGUARDANDO_APROVACAO. Silencio nao aprova. O botao de decidir so existe na peca para
// quem tem a permissao (e o servidor decide de novo na API).
export default async function PortalApprovalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const loaded = await guarded("/portal", async () => {
    const { page, pageSize } = parsePageParams(await searchParams);
    const scope = await loadPortalScope();
    if (!scope.active) return { scope, data: null };
    const r = await pageContentsFor(getDb(), scope.active.ctx, { page, pageSize, dir: "asc", sort: "plannedOn", status: "AGUARDANDO_APROVACAO" });
    return { scope, data: { page, pageSize, items: r.items.map((i) => contentPortalOut.parse(i)), total: r.total } };
  });
  if (!loaded.ok) return loaded.view;
  const { scope, data } = loaded.data;
  if (!scope.active || !data) return <NoActiveClient crumbs={crumbs} title="Aprovações" />;
  const { canApprove } = scope.active;
  return (
    <>
      <PageHeader crumbs={crumbs} title="Aprovações" description="Peças que aguardam a sua decisão. Abra uma peça para ver a prévia e aprovar ou pedir revisão." />
      {!canApprove ? (
        <Alert className="mb-4" data-testid="no-approve-note">
          <AlertDescription>Você pode ver as peças e comentar, mas só o responsável do cliente (ou quem recebeu essa permissão) pode aprovar ou pedir revisão.</AlertDescription>
        </Alert>
      ) : null}
      {data.total === 0 ? (
        <EmptyState icon={ClipboardCheck} title="Nada aguardando a sua aprovação" description="Quando a agência enviar uma peça para aprovação, ela aparece aqui." />
      ) : (
        <>
          <ul className="flex flex-col gap-3" aria-label="Peças aguardando aprovação">
            {data.items.map((c) => (
              <li key={c.id}>
                <Card className="py-4">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium break-words">{c.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {FORMAT_LABEL[c.format] ?? c.format} · data prevista {formatDay(c.plannedOn)}
                      </p>
                    </div>
                    <Button asChild>
                      <Link href={`/portal/contents/${c.id}#decisao`} aria-label={`${canApprove ? "Revisar e decidir" : "Ver"} ${c.title}`}>
                        {canApprove ? "Revisar e decidir" : "Ver peça"}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          <Pagination basePath="/portal/approvals" page={data.page} pageSize={data.pageSize} total={data.total} />
        </>
      )}
    </>
  );
}
