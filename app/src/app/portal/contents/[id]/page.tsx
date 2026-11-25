import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "@/components/app/external-link";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { NoActiveClient } from "@/components/app/portal-gate";
import { ContentStatusBadge } from "@/components/app/status-badges";
import { AttachmentList } from "@/components/fase2/attachments";
import { MediaLinkList } from "@/components/fase2/media-links";
import { CommentsPanel } from "@/components/fase2/comments-panel";
import { DecisionPanel } from "@/components/fase2/decision-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/formatting/date";
import { CHANNEL_LABEL, DECISION_LABEL, FORMAT_LABEL, formatDay } from "@/lib/labels";
import { getServerEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { NotFoundError } from "@/server/errors";
import { approvalOut, commentOut, contentPortalOut, linkedAssetPortalOut, mediaLinkPortalOut, versionPortalOut } from "@/server/http/dto-fase2";
import { loadPortalScope, one, type SearchParams } from "@/server/page-data";
import { isUuid } from "@/server/services/access";
import { getContentView } from "@/server/services/queries";

export const metadata: Metadata = { title: "Peça" };

export default async function PortalContentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const loaded = await guarded("/portal/contents", async () => {
    const { id } = await params;
    const sp = await searchParams;
    const scope = await loadPortalScope();
    if (!scope.active) return { scope, d: null };
    if (!isUuid(id)) throw new NotFoundError();
    const v = await getContentView(getDb(), scope.active.ctx, id);
    return {
      scope,
      d: {
        content: contentPortalOut.parse(v.content),
        versions: v.versions.map((x) => versionPortalOut.parse(x)),
        approvals: v.approvals.map((x) => approvalOut.parse({ ...x, authorName: x.author.name })),
        comments: v.comments.map((c) => commentOut.parse({ ...c, authorName: c.author.name })),
        assets: v.assets.map((a) => linkedAssetPortalOut.parse(a)),
        mediaLinks: v.mediaLinks.map((m) => mediaLinkPortalOut.parse(m)),
        uploadsEnabled: getServerEnv().UPLOADS_ENABLED,
        viewing: one(sp, "v"),
      },
    };
  });
  if (!loaded.ok) return loaded.view;
  const { scope, d } = loaded.data;
  const crumbs = [{ label: "Início", href: "/portal" }, { label: "Conteúdos", href: "/portal/contents" }, { label: "Peça" }];
  if (!scope.active || !d) return <NoActiveClient crumbs={crumbs} title="Peça" />;
  const tz = scope.active.timezone;
  const { content, versions, approvals, comments } = d;
  const sent = [...versions].filter((v) => v.status === "ENVIADA").sort((a, b) => b.number - a.number);
  const current = sent.find((v) => v.id === content.currentVersionId) ?? sent[0];
  const shown = (d.viewing ? sent.find((v) => v.id === d.viewing) : undefined) ?? current;
  const outdated = !!shown && !!current && shown.id !== current.id;
  const versionNo = new Map(versions.map((v) => [v.id, v.number]));
  const shownAssets = shown ? d.assets.filter((a) => a.link.versionId === shown.id) : [];
  const evidence = d.assets.filter((a) => !a.link.versionId);
  const toItem = (a: (typeof d.assets)[number]) => ({
    linkId: a.link.id,
    role: a.link.role,
    position: a.link.position,
    asset: { id: a.asset.id, originalName: a.asset.originalName, category: a.asset.category, bytes: a.asset.bytes, status: a.asset.status },
  });
  const awaiting = content.status === "AGUARDANDO_APROVACAO";
  const scopeApi = { kind: "portal" } as const;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Início", href: "/portal" }, { label: "Conteúdos", href: "/portal/contents" }, { label: content.title }]}
        title={content.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ContentStatusBadge status={content.status} audience="client" />
            <span>
              {FORMAT_LABEL[content.format] ?? content.format} · {CHANNEL_LABEL[content.channel] ?? content.channel} · data prevista {formatDay(content.plannedOn)}
            </span>
          </span>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <Card id="decisao">
          <CardHeader>
            <CardTitle>{shown ? `Prévia da versão ${shown.number}` : "Prévia"}</CardTitle>
            <CardDescription>{shown?.sentAt ? `Enviada pela agência em ${formatDateTime(shown.sentAt, tz)}.` : "A agência ainda não enviou uma versão para você."}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {outdated && current ? (
              <Alert variant="destructive" data-testid="outdated-version">
                <AlertTitle>Versão desatualizada</AlertTitle>
                <AlertDescription>
                  <p>
                    Você está vendo a versão {shown?.number}, que não é mais a atual. Só a versão {current.number} pode ser aprovada.
                  </p>
                  <Button asChild className="mt-3" variant="outline">
                    <Link href={`/portal/contents/${content.id}`}>Ver a versão atual</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {shown ? (
              <>
                <div>
                  <h3 className="mb-1 text-base font-semibold">Legenda</h3>
                  <p className="whitespace-pre-wrap break-words text-sm">{shown.caption ?? "N/D"}</p>
                </div>
                <div>
                  <h3 className="mb-1 text-base font-semibold">Chamada para ação</h3>
                  <p className="text-sm">{shown.cta ?? "N/D"}</p>
                </div>
                <div>
                  <h3 className="mb-1 text-base font-semibold">Hashtags</h3>
                  <p className="text-sm break-words">{shown.hashtags.length ? shown.hashtags.join(" ") : "N/D"}</p>
                </div>
                <div>
                  <h3 className="mb-2 text-base font-semibold">Links de mídia</h3>
                  <MediaLinkList
                    scope={scopeApi}
                    items={d.mediaLinks.filter((m) => m.versionId === shown.id).map((m) => ({ id: m.id, label: m.label, url: m.url, host: m.host, kind: m.kind }))}
                    emptyText="Nenhum link de mídia nesta versão."
                  />
                </div>
                {d.uploadsEnabled ? (
                  <div>
                    <h3 className="mb-2 text-base font-semibold">Arquivos</h3>
                    <AttachmentList scope={scopeApi} items={shownAssets.map(toItem)} />
                  </div>
                ) : null}
              </>
            ) : null}

            {awaiting && shown && !outdated ? (
              scope.active.canApprove ? (
                <DecisionPanel key={shown.id} contentId={content.id} versionId={shown.id} versionNumber={shown.number} />
              ) : (
                <Alert>
                  <AlertDescription>Esta peça aguarda a decisão do responsável do cliente. Você pode comentar abaixo.</AlertDescription>
                </Alert>
              )
            ) : null}
            {!awaiting && shown ? <p className="text-sm text-muted-foreground">Esta peça não está aguardando a sua decisão agora.</p> : null}
          </CardContent>
        </Card>

        {content.publicationUrl || (d.uploadsEnabled && evidence.length > 0) ? (
          <Card>
            <CardHeader>
              <CardTitle>Publicação</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {content.publishedAt ? <p className="text-sm">Publicada em {formatDateTime(content.publishedAt, tz)}.</p> : null}
              {content.publicationUrl ? <ExternalLink href={content.publicationUrl} label="Ver publicação" /> : null}
              {d.uploadsEnabled && evidence.length > 0 ? <AttachmentList scope={scopeApi} items={evidence.map(toItem)} /> : null}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Histórico de versões e decisões</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2" aria-label="Versões enviadas">
              {sent.length === 0 ? <li className="text-sm text-muted-foreground">Nenhuma versão enviada ainda.</li> : null}
              {sent.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3 text-sm">
                  <span className="font-medium">Versão {v.number}</span>
                  {v.id === current?.id ? <Badge variant="success">Atual</Badge> : <Badge variant="outline">Anterior</Badge>}
                  {v.sentAt ? <span className="text-muted-foreground">{formatDateTime(v.sentAt, tz)}</span> : null}
                  {v.id !== shown?.id ? (
                    <Link href={`/portal/contents/${content.id}?v=${v.id}`} className="font-medium text-primary underline underline-offset-4">
                      Ver esta versão
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">(exibida)</span>
                  )}
                </li>
              ))}
            </ul>
            <ul className="flex flex-col gap-2" aria-label="Decisões">
              {approvals.length === 0 ? <li className="text-sm text-muted-foreground">Nenhuma decisão registrada.</li> : null}
              {approvals.map((a) => (
                <li key={a.id} className="rounded-lg border bg-background p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={a.decision === "APROVADO" ? "success" : "warning"}>{DECISION_LABEL[a.decision] ?? a.decision}</Badge>
                    <span>
                      versão {versionNo.get(a.versionId) ?? "?"} · {a.authorName} · {formatDateTime(a.createdAt, tz)}
                    </span>
                    {a.invalidatedAt ? <Badge variant="outline">Substituída por nova versão</Badge> : null}
                  </div>
                  {a.comment ? <p className="mt-2 whitespace-pre-wrap">{a.comment}</p> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comentários</CardTitle>
            <CardDescription>Seus comentários são visíveis para a agência.</CardDescription>
          </CardHeader>
          <CardContent>
            <CommentsPanel scope={scopeApi} target="content" targetId={content.id} comments={comments} canComment={scope.active.canComment} agency={false} timeZone={tz} versionId={shown?.id} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
