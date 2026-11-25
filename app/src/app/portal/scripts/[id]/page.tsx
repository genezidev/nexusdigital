import type { Metadata } from "next";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { NoActiveClient } from "@/components/app/portal-gate";
import { RecordingHistory, ScriptInstructions, type RecordingData } from "@/components/app/script-view";
import { ScriptStatusBadge } from "@/components/app/status-badges";
import { AttachmentList } from "@/components/fase2/attachments";
import { CommentsPanel } from "@/components/fase2/comments-panel";
import { MediaLinkForm, MediaLinkList } from "@/components/fase2/media-links";
import { RecordingForm } from "@/components/fase2/recording-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getServerEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { DEFAULT_RECORDING_DOMAINS } from "@/server/domain/external-link";
import { NotFoundError } from "@/server/errors";
import { commentOut, linkedAssetPortalOut, mediaLinkPortalOut, recordingOut, scriptPortalOut } from "@/server/http/dto-fase2";
import { loadPortalScope, loadUploadLimits } from "@/server/page-data";
import { isUuid } from "@/server/services/access";
import { getScriptView } from "@/server/services/queries";

export const metadata: Metadata = { title: "Roteiro" };

export default async function PortalScriptDetail({ params }: { params: Promise<{ id: string }> }) {
  const loaded = await guarded("/portal/scripts", async () => {
    const { id } = await params;
    const scope = await loadPortalScope();
    if (!scope.active) return { scope, d: null };
    if (!isUuid(id)) throw new NotFoundError();
    const v = await getScriptView(getDb(), scope.active.ctx, id);
    const env = getServerEnv().RECORDING_LINK_DOMAINS;
    return {
      scope,
      d: {
        script: scriptPortalOut.parse(v.script),
        recordings: v.recordings.map((r) => recordingOut.parse(r)),
        comments: v.comments.map((c) => commentOut.parse({ ...c, authorName: c.author.name })),
        assets: v.assets.map((a) => linkedAssetPortalOut.parse(a)),
        // `mine` e calculado ANTES do DTO: o portal nunca recebe o id de quem cadastrou, so se foi a propria pessoa.
        mediaLinks: v.mediaLinks.map((m) => ({ ...mediaLinkPortalOut.parse(m), mine: m.createdById === scope.active!.ctx.userId })),
        myRecordingIds: v.recordings.filter((r) => r.submittedById === scope.active!.ctx.userId).map((r) => r.id),
        uploadsEnabled: getServerEnv().UPLOADS_ENABLED,
        limits: loadUploadLimits(),
        domains: env.length ? env : [...DEFAULT_RECORDING_DOMAINS],
      },
    };
  });
  if (!loaded.ok) return loaded.view;
  const { scope, d } = loaded.data;
  const crumbs = [{ label: "Início", href: "/portal" }, { label: "Roteiros", href: "/portal/scripts" }, { label: "Roteiro" }];
  if (!scope.active || !d) return <NoActiveClient crumbs={crumbs} title="Roteiro" />;
  const { script } = d;
  const tz = scope.active.timezone;
  const scopeApi = { kind: "portal" } as const;
  const pdfs = d.assets
    .filter((a) => a.link.scriptId === script.id)
    .map((a) => ({ linkId: a.link.id, role: a.link.role, position: a.link.position, asset: { id: a.asset.id, originalName: a.asset.originalName, category: a.asset.category, bytes: a.asset.bytes, status: a.asset.status } }));
  const recordings: RecordingData[] = d.recordings.map((r) => {
    const link = d.assets.find((a) => a.link.recordingId === r.id);
    return {
      ...r,
      asset: link ? { id: link.asset.id, originalName: link.asset.originalName, bytes: link.asset.bytes } : undefined,
      mediaLinks: d.mediaLinks.filter((m) => m.recordingId === r.id).map((m) => ({ id: m.id, label: m.label, url: m.url, host: m.host, kind: m.kind, removable: m.mine })),
    };
  });
  const awaiting = script.status === "AGUARDANDO_GRAVACAO";
  const lastFeedback = recordings.find((r) => r.status === "REGRAVACAO_SOLICITADA" && r.feedback);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Início", href: "/portal" }, { label: "Roteiros", href: "/portal/scripts" }, { label: script.title }]}
        title={script.title}
        description={<ScriptStatusBadge status={script.status} audience="client" />}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {awaiting && lastFeedback ? (
          <Alert data-testid="rerecording-notice">
            <AlertDescription>
              A agência pediu uma nova gravação: <span className="font-medium">{lastFeedback.feedback}</span>
            </AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Instruções e cenas</CardTitle>
          </CardHeader>
          <CardContent>
            <ScriptInstructions script={script} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Materiais do roteiro</CardTitle>
            <CardDescription>Referências e o roteiro em PDF, em links que a agência cadastrou.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <MediaLinkList
              scope={scopeApi}
              items={d.mediaLinks.filter((m) => m.scriptId === script.id).map((m) => ({ id: m.id, label: m.label, url: m.url, host: m.host, kind: m.kind }))}
              emptyText="Nenhum material cadastrado neste roteiro."
            />
            {d.uploadsEnabled && pdfs.length > 0 ? <AttachmentList scope={scopeApi} items={pdfs} /> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sua gravação</CardTitle>
            <CardDescription>Envie o vídeo ou um link e depois marque como enviada. A agência confere e confirma o recebimento.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {awaiting && scope.active.canSubmitRecording ? (
              <RecordingForm scope={scopeApi} scriptId={script.id} limits={d.limits} domains={d.domains} uploadsEnabled={d.uploadsEnabled} />
            ) : awaiting ? (
              <Alert>
                <AlertDescription>Você não tem permissão para enviar gravações neste cliente.</AlertDescription>
              </Alert>
            ) : (
              <p className="text-sm text-muted-foreground">{script.status === "ENVIADO" ? "A agência ainda vai liberar este roteiro para gravação." : "O envio de gravação está fechado neste momento."}</p>
            )}
            <div>
              <h3 className="mb-2 text-base font-semibold">Envios e retorno da agência</h3>
              <RecordingHistory
                recordings={recordings}
                scope={scopeApi}
                timeZone={tz}
                actions={(r) =>
                  scope.active!.canSubmitRecording && d.myRecordingIds.includes(r.id) ? (
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">Adicionar outro link de mídia a esta gravação</summary>
                      <div className="mt-3">
                        <MediaLinkForm scope={scopeApi} target={{ recordingId: r.id }} audience="portal" />
                      </div>
                    </details>
                  ) : null
                }
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comentários</CardTitle>
          </CardHeader>
          <CardContent>
            <CommentsPanel scope={scopeApi} target="script" targetId={script.id} comments={d.comments} canComment={scope.active.canComment} agency={false} timeZone={tz} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
