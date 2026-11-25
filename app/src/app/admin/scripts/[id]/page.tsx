import type { Metadata } from "next";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { RecordingHistory, ScriptInstructions, type RecordingData } from "@/components/app/script-view";
import { ScriptStatusBadge } from "@/components/app/status-badges";
import { AttachmentList, ScriptPdfUploader } from "@/components/fase2/attachments";
import { CommentsPanel } from "@/components/fase2/comments-panel";
import { RecordingReviewActions, ScriptFormDialog, ScriptStatusPanel, type ScriptDefaults } from "@/components/fase2/script-forms";
import { RecordingForm } from "@/components/fase2/recording-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/server/authorization/permissions";
import { getDb } from "@/server/db/client";
import { DEFAULT_RECORDING_DOMAINS } from "@/server/domain/external-link";
import { allowedScriptTransitions, isScriptEditable } from "@/server/domain/script-state";
import { NotFoundError } from "@/server/errors";
import { commentOut, linkedAssetAgencyOut, recordingOut, scriptAgencyOut } from "@/server/http/dto-fase2";
import { getServerEnv } from "@/server/config/env";
import { loadAdminScope, loadAssignees, loadUploadLimits, type SearchParams } from "@/server/page-data";
import { isUuid } from "@/server/services/access";
import { getScriptView, pageContentsFor } from "@/server/services/queries";
import type { ScriptStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Roteiro" };

export default async function AdminScriptDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const loaded = await guarded("/admin/scripts", async () => {
    const { id } = await params;
    const scope = await loadAdminScope(await searchParams);
    if (!scope.selected || !isUuid(id)) throw new NotFoundError();
    const ctx = scope.selected.ctx;
    const v = await getScriptView(getDb(), ctx, id);
    const contents = await pageContentsFor(getDb(), ctx, { page: 1, pageSize: 50, sort: "title", dir: "asc" });
    return {
      scope,
      script: scriptAgencyOut.parse(v.script),
      recordings: v.recordings.map((r) => recordingOut.parse(r)),
      comments: v.comments.map((c) => commentOut.parse({ ...c, authorName: c.author.name })),
      assets: v.assets.map((a) => linkedAssetAgencyOut.parse(a)),
      assignees: await loadAssignees(ctx),
      contents: contents.items.map((c) => ({ id: c.id, title: c.title })),
      limits: loadUploadLimits(),
      domains: (() => {
        const e = getServerEnv().RECORDING_LINK_DOMAINS;
        return e.length ? e : [...DEFAULT_RECORDING_DOMAINS];
      })(),
      flags: { write: can(ctx, "script:write"), review: can(ctx, "recording:review"), comment: can(ctx, "comment:create") },
    };
  });
  if (!loaded.ok) return loaded.view;
  const d = loaded.data;
  const sel = d.scope.selected!;
  const { script } = d;
  const status = script.status as ScriptStatus;
  const editable = isScriptEditable(status);
  const targets = d.flags.write ? allowedScriptTransitions(status, false).filter((t) => t !== "GRAVACAO_RECEBIDA") : [];
  const assigneeName = d.assignees.find((a) => a.id === script.assigneeId)?.name;
  const scope = { kind: "admin", clientId: sel.id } as const;
  const pdfs = d.assets.filter((a) => a.link.scriptId === script.id).map((a) => ({ linkId: a.link.id, role: a.link.role, position: a.link.position, asset: { id: a.asset.id, originalName: a.asset.originalName, category: a.asset.category, bytes: a.asset.bytes, status: a.asset.status } }));
  const recordings: RecordingData[] = d.recordings.map((r) => {
    const link = d.assets.find((a) => a.link.recordingId === r.id);
    return { ...r, asset: link ? { id: link.asset.id, originalName: link.asset.originalName, bytes: link.asset.bytes } : undefined };
  });
  const defaults: ScriptDefaults = {
    title: script.title,
    objective: script.objective ?? "",
    plannedDurationSeconds: script.plannedDurationSeconds === null ? "" : String(script.plannedDurationSeconds),
    deadlineOn: script.deadlineOn ?? "",
    location: script.location ?? "",
    equipment: script.equipment ?? "",
    audioNotes: script.audioNotes ?? "",
    lightNotes: script.lightNotes ?? "",
    framingNotes: script.framingNotes ?? "",
    referenceLinks: Array.isArray(script.referenceLinks) ? (script.referenceLinks as string[]).join("\n") : "",
    assigneeId: script.assigneeId ?? "",
    contentId: script.contentId ?? "",
    scenes: (script.scenes ?? []).map((s) => ({ dialogue: s.dialogue ?? "", action: s.action ?? "", durationSeconds: s.durationSeconds === null ? "" : String(s.durationSeconds) })),
  };
  if (defaults.scenes.length === 0) defaults.scenes.push({ dialogue: "", action: "", durationSeconds: "" });

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Painel", href: "/admin" }, { label: "Roteiros", href: `/admin/scripts?client=${sel.id}` }, { label: script.title }]}
        title={script.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ScriptStatusBadge status={script.status} />
            <span>Cliente: {sel.name}</span>
          </span>
        }
        actions={d.flags.write && editable ? <ScriptFormDialog key={script.updatedAt} clientId={sel.id} scriptId={script.id} defaults={defaults} assignees={d.assignees} contents={d.contents} /> : undefined}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Fluxo do roteiro</CardTitle>
            <CardDescription>Só as ações permitidas aparecem. Gravação recebida é confirmada na conferência abaixo.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScriptStatusPanel clientId={sel.id} scriptId={script.id} targets={targets} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instruções e cenas</CardTitle>
          </CardHeader>
          <CardContent>
            <ScriptInstructions script={script} assigneeName={assigneeName} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PDF do roteiro</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <AttachmentList scope={scope} items={pdfs} removableClientId={editable && d.flags.write ? sel.id : undefined} />
            {editable && d.flags.write ? <ScriptPdfUploader clientId={sel.id} scriptId={script.id} limits={d.limits} /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gravações</CardTitle>
            <CardDescription>Envios anteriores continuam no histórico.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <RecordingHistory
              recordings={recordings}
              scope={scope}
              timeZone={sel.timezone}
              actions={d.flags.review ? (r) => (r.status === "ENVIADA" ? <RecordingReviewActions clientId={sel.id} recordingId={r.id} /> : null) : undefined}
            />
            {status === "AGUARDANDO_GRAVACAO" ? (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-medium">Registrar gravação em nome da equipe</summary>
                <div className="mt-3">
                  <RecordingForm scope={scope} scriptId={script.id} limits={d.limits} domains={d.domains} />
                </div>
              </details>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Comentários</CardTitle>
            <CardDescription>Interno: só a agência lê. Compartilhado: o cliente também lê.</CardDescription>
          </CardHeader>
          <CardContent>
            <CommentsPanel scope={scope} target="script" targetId={script.id} comments={d.comments} canComment={d.flags.comment} agency timeZone={sel.timezone} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
