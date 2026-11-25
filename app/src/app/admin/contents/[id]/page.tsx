import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink } from "@/components/app/external-link";
import { guarded } from "@/components/app/page-error";
import { PageHeader } from "@/components/app/page-header";
import { ProgressCard } from "@/components/app/progress-card";
import { ContentStatusBadge, OverdueBadge, VisibilityBadge } from "@/components/app/status-badges";
import { AttachmentList, VersionAttachUploader } from "@/components/fase2/attachments";
import { CommentsPanel } from "@/components/fase2/comments-panel";
import { ClassificationPanel, ContentStatusPanel, MoveCycleDialog, RescheduleDialog, ShareToggle } from "@/components/fase2/content-actions";
import { MaterialEditor, PlanningForm } from "@/components/fase2/content-forms";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/formatting/date";
import { CHANNEL_LABEL, DECISION_LABEL, FORMAT_LABEL, competenceLabel, formatDay, isOverdue, todayIsoIn } from "@/lib/labels";
import { daysInMonth } from "@/lib/calendar-grid";
import { can } from "@/server/authorization/permissions";
import { getDb } from "@/server/db/client";
import { allowedContentTransitions } from "@/server/domain/content-state";
import { approvalOut, commentOut, contentAgencyOut, linkedAssetAgencyOut, versionAgencyOut } from "@/server/http/dto-fase2";
import { loadAdminScope, loadAssignees, loadOpenCycles, loadUploadLimits, type SearchParams } from "@/server/page-data";
import { NotFoundError } from "@/server/errors";
import { getCycleView, getContentView } from "@/server/services/queries";
import { isUuid } from "@/server/services/access";
import type { ContentStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Peça" };

const LOCKED = new Set(["PUBLICADO", "ANALISADO", "CANCELADO"]);

export default async function AdminContentDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const loaded = await guarded("/admin/contents", async () => {
    const { id } = await params;
    const scope = await loadAdminScope(await searchParams);
    if (!scope.selected || !isUuid(id)) throw new NotFoundError();
    const ctx = scope.selected.ctx;
    const v = await getContentView(getDb(), ctx, id);
    const content = contentAgencyOut.parse(v.content);
    const cv = await getCycleView(getDb(), ctx, content.cycleId);
    const [assignees, openCycles] = await Promise.all([loadAssignees(ctx), loadOpenCycles(ctx)]);
    return {
      scope,
      ctx,
      content,
      versions: v.versions.map((x) => versionAgencyOut.parse(x)),
      approvals: v.approvals.map((x) => approvalOut.parse({ ...x, authorName: x.author.name })),
      comments: v.comments.map((c) => commentOut.parse({ ...c, authorName: c.author.name })),
      assets: v.assets.map((x) => linkedAssetAgencyOut.parse(x)),
      cycle: { year: cv.cycle.year, month: cv.cycle.month, status: cv.cycle.status },
      progress: cv.progress,
      assignees,
      openCycles: openCycles.map((c) => ({ id: c.id, label: competenceLabel(c.year, c.month) })).filter((c) => c.id !== content.cycleId),
      limits: loadUploadLimits(),
      today: todayIsoIn(scope.selected.timezone, new Date()),
      flags: { write: can(ctx, "content:write"), classify: can(ctx, "content:classify"), comment: can(ctx, "comment:create") },
    };
  });
  if (!loaded.ok) return loaded.view;
  const d = loaded.data;
  const sel = d.scope.selected;
  if (!sel) notFound();
  const { content, versions, approvals, comments, assets, cycle } = d;
  const tz = sel.timezone;
  const status = content.status as ContentStatus;
  const draft = [...versions].filter((x) => x.status === "RASCUNHO").sort((a, b) => b.number - a.number)[0];
  const current = versions.find((x) => x.id === content.currentVersionId);
  const editing = draft ?? current;
  const manual = d.flags.write ? allowedContentTransitions(status, "manual") : [];
  const canCancel = manual.includes("CANCELADO");
  const manualTargets = manual.filter((t) => t !== "CANCELADO");
  const canSend = d.flags.write && !!draft && (status === "EM_PRODUCAO" || status === "EM_REVISAO");
  const sendHint = !d.flags.write
    ? "Você pode ler esta peça, mas não alterá-la."
    : status === "PLANEJADO"
      ? "Inicie a produção para poder criar e enviar versões."
      : status === "EM_PRODUCAO" || status === "EM_REVISAO"
        ? "Salve o material (rascunho) antes de enviar para aprovação."
        : undefined;
  const versionNumber = new Map(versions.map((x) => [x.id, x.number]));
  const items = assets.map((a) => ({
    linkId: a.link.id,
    role: a.link.role,
    position: a.link.position,
    versionNumber: a.link.versionId ? versionNumber.get(a.link.versionId) : undefined,
    asset: { id: a.asset.id, originalName: a.asset.originalName, category: a.asset.category, bytes: a.asset.bytes, status: a.asset.status },
    editable: a.link.versionId === draft?.id,
  }));
  const monthStart = `${cycle.year}-${String(cycle.month).padStart(2, "0")}-01`;
  const monthEnd = `${cycle.year}-${String(cycle.month).padStart(2, "0")}-${String(daysInMonth(cycle.year, cycle.month)).padStart(2, "0")}`;
  const overdue = isOverdue(content.plannedOn, content.status, d.today);
  const assigneeName = d.assignees.find((a) => a.id === content.assigneeId)?.name;
  const materialLocked = LOCKED.has(content.status) || !d.flags.write;
  const scope = { kind: "admin", clientId: sel.id } as const;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Painel", href: "/admin" }, { label: "Conteúdos", href: `/admin/contents?client=${sel.id}` }, { label: content.title }]}
        title={content.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ContentStatusBadge status={content.status} />
            {overdue ? <OverdueBadge /> : null}
            <VisibilityBadge visibility={content.visibility} />
            {!content.countsTowardQuota ? <Badge variant="outline">Fora da cota</Badge> : null}
            {content.isBonus ? <Badge variant="outline">Bônus</Badge> : null}
            <span>Cliente: {sel.name}</span>
          </span>
        }
        actions={
          d.flags.write && !LOCKED.has(content.status) ? (
            <>
              <ShareToggle clientId={sel.id} contentId={content.id} visibility={content.visibility} />
              <RescheduleDialog clientId={sel.id} contentId={content.id} current={content.plannedOn} min={monthStart} max={monthEnd} />
            </>
          ) : undefined
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="Formato" value={FORMAT_LABEL[content.format] ?? content.format} />
              <Info label="Canal" value={CHANNEL_LABEL[content.channel] ?? content.channel} />
              <Info label="Data prevista" value={formatDay(content.plannedOn)} />
              <Info label="Ciclo" value={`${competenceLabel(cycle.year, cycle.month)} (${cycle.status === "ABERTO" ? "aberto" : "encerrado"})`} />
              <Info label="Responsável" value={assigneeName ?? (content.assigneeId ? "Membro da equipe" : "N/D")} />
              <Info label="Pilar" value={content.pillar ?? "N/D"} />
              <Info label="Objetivo (interno)" value={content.objective ?? "N/D"} />
              <div>
                <dt className="text-sm text-muted-foreground">Publicação</dt>
                <dd className="font-medium">{content.publicationUrl ? <ExternalLink href={content.publicationUrl} label="Ver publicação" /> : "N/D"}</dd>
              </div>
              {content.publishedAt ? <Info label="Publicado em" value={formatDateTime(content.publishedAt, tz)} /> : null}
              {content.cancelReason ? <Info label="Motivo do cancelamento" value={content.cancelReason} /> : null}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fluxo de status</CardTitle>
            <CardDescription>Só aparecem as ações permitidas a partir do status atual. A aprovação ou o pedido de revisão é sempre do cliente.</CardDescription>
          </CardHeader>
          <CardContent>
            <ContentStatusPanel clientId={sel.id} contentId={content.id} manualTargets={manualTargets} canSend={canSend} sendHint={sendHint} draftVersionId={draft?.id} canCancel={canCancel} />
          </CardContent>
        </Card>

        <ProgressCard title={`Progresso de ${competenceLabel(cycle.year, cycle.month)}`} progress={d.progress} />

        {d.flags.classify ? (
          <Card>
            <CardHeader>
              <CardTitle>Classificação na cota</CardTitle>
              <CardDescription>Só o administrador altera, com registro na auditoria.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ClassificationPanel clientId={sel.id} contentId={content.id} counts={content.countsTowardQuota} bonus={content.isBonus} />
              <div>
                <MoveCycleDialog clientId={sel.id} contentId={content.id} cycles={d.openCycles} />
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Material da peça</CardTitle>
            <CardDescription>Legenda, CTA, hashtags e arquivos. O cliente só vê versões enviadas.</CardDescription>
          </CardHeader>
          <CardContent>
            {materialLocked ? (
              <div className="flex flex-col gap-3">
                {LOCKED.has(content.status) ? (
                  <Alert>
                    <AlertDescription>Peça {content.status === "CANCELADO" ? "cancelada" : "publicada"}: o material não é mais editado. Registre correções como comentário.</AlertDescription>
                  </Alert>
                ) : null}
                <MaterialReadOnly version={current ?? draft} />
              </div>
            ) : (
              <MaterialEditor
                key={editing?.id ?? "novo"}
                clientId={sel.id}
                contentId={content.id}
                status={content.status}
                currentVersionId={content.currentVersionId}
                initial={{ caption: editing?.caption ?? "", cta: editing?.cta ?? "", hashtags: (editing?.hashtags ?? []).join(" "), briefing: editing?.briefing ?? "" }}
                format={content.format}
                channel={content.channel}
                hasDraft={!!draft}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Arquivos</CardTitle>
            <CardDescription>Prévias e arquivos finais ligados às versões. Download por link assinado de poucos segundos.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {items.length === 0 ? <AttachmentList scope={scope} items={[]} /> : null}
            {items.some((i) => i.editable) ? <AttachmentList scope={scope} items={items.filter((i) => i.editable)} removableClientId={sel.id} /> : null}
            {items.some((i) => !i.editable) ? <AttachmentList scope={scope} items={items.filter((i) => !i.editable)} /> : null}
            {draft && d.flags.write ? (
              <VersionAttachUploader clientId={sel.id} versionId={draft.id} limits={d.limits} nextPosition={items.filter((i) => i.editable && i.role === "PREVIA").length} />
            ) : d.flags.write && !LOCKED.has(content.status) ? (
              <p className="text-sm text-muted-foreground">Salve o material para criar o rascunho da versão e então anexe os arquivos. Versão já enviada é imutável: para trocar arquivos, crie uma nova versão.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Versões e decisões do cliente</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2" aria-label="Versões">
              {versions.length === 0 ? <li className="text-sm text-muted-foreground">Nenhuma versão criada ainda.</li> : null}
              {versions.map((x) => (
                <li key={x.id} className="rounded-lg border bg-background p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Versão {x.number}</span>
                    <Badge variant={x.status === "ENVIADA" ? "secondary" : "outline"}>{x.status === "ENVIADA" ? "Enviada (imutável)" : "Rascunho"}</Badge>
                    {x.id === content.currentVersionId ? <Badge variant="success">Atual</Badge> : null}
                    {x.sentAt ? <span className="text-muted-foreground">enviada em {formatDateTime(x.sentAt, tz)}</span> : null}
                  </div>
                  {x.caption ? <p className="mt-2 line-clamp-3 whitespace-pre-wrap">{x.caption}</p> : null}
                </li>
              ))}
            </ul>
            <ul className="flex flex-col gap-2" aria-label="Decisões do cliente">
              {approvals.length === 0 ? <li className="text-sm text-muted-foreground">Nenhuma decisão do cliente ainda. Silêncio não aprova.</li> : null}
              {approvals.map((a) => (
                <li key={a.id} className="rounded-lg border bg-background p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={a.decision === "APROVADO" ? "success" : "warning"}>{DECISION_LABEL[a.decision] ?? a.decision}</Badge>
                    <span>
                      versão {versionNumber.get(a.versionId) ?? "?"} · {a.authorName} · {formatDateTime(a.createdAt, tz)}
                    </span>
                    {a.invalidatedAt ? <Badge variant="destructive">Invalidada: {a.invalidationReason ?? "nova versão"}</Badge> : null}
                  </div>
                  {a.comment ? <p className="mt-2 whitespace-pre-wrap">{a.comment}</p> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {d.flags.write && content.status !== "CANCELADO" ? (
          <Card>
            <CardHeader>
              <CardTitle>Planejamento</CardTitle>
              <CardDescription>Título, responsável, pilar e notas mudam sem invalidar a aprovação.</CardDescription>
            </CardHeader>
            <CardContent>
              <PlanningForm
                clientId={sel.id}
                contentId={content.id}
                initial={{
                  title: content.title,
                  description: content.description ?? "",
                  pillar: content.pillar ?? "",
                  objective: content.objective ?? "",
                  internalNotes: content.internalNotes ?? "",
                  assigneeId: content.assigneeId ?? "",
                  assigneeVisibleToClient: content.assigneeVisibleToClient,
                }}
                assignees={d.assignees}
              />
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Comentários</CardTitle>
            <CardDescription>Interno: só a agência lê. Compartilhado: o cliente também lê.</CardDescription>
          </CardHeader>
          <CardContent>
            <CommentsPanel scope={scope} target="content" targetId={content.id} comments={comments} canComment={d.flags.comment} agency timeZone={tz} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium whitespace-pre-wrap break-words">{value}</dd>
    </div>
  );
}

function MaterialReadOnly({ version }: { version: { number: number; caption: string | null; cta: string | null; hashtags: string[] } | undefined }) {
  if (!version) return <p className="text-sm text-muted-foreground">Sem versão registrada.</p>;
  return (
    <dl className="grid gap-3">
      <Info label={`Versão ${version.number}: legenda`} value={version.caption ?? "N/D"} />
      <Info label="CTA" value={version.cta ?? "N/D"} />
      <Info label="Hashtags" value={version.hashtags.length ? version.hashtags.join(" ") : "N/D"} />
    </dl>
  );
}
