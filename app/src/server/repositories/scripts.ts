import type { Prisma } from "@/generated/prisma/client";
import type { RecordingKind, RecordingStatus, ScriptStatus } from "@/generated/prisma/enums";
import { assertCan, isAgency } from "@/server/authorization/permissions";
import type { Scoped } from "@/server/db/scope";

// Roteiros: RASCUNHO e interno (o cliente so ve a partir de ENVIADO). Toda consulta leva client_id da sessao.

function visibleWhere(s: Scoped): Prisma.ScriptWhereInput {
  return isAgency(s.ctx) ? { clientId: s.ctx.clientId } : { clientId: s.ctx.clientId, status: { not: "RASCUNHO" } };
}

export interface ScriptFields {
  contentId?: string | null;
  title?: string;
  objective?: string | null;
  plannedDurationSeconds?: number | null;
  assigneeId?: string | null;
  deadlineOn?: Date | null;
  location?: string | null;
  equipment?: string | null;
  audioNotes?: string | null;
  lightNotes?: string | null;
  framingNotes?: string | null;
  referenceLinks?: string[];
  checklist?: { text: string; done: boolean }[];
}

export async function listScripts(s: Scoped) {
  assertCan(s.ctx, "script:read");
  return s.tx.script.findMany({ where: visibleWhere(s), orderBy: { createdAt: "desc" } });
}

export interface ScriptPageQuery {
  page: number;
  pageSize: number;
  status?: ScriptStatus;
  contentId?: string;
  q?: string;
  sort: "createdAt" | "title" | "status" | "deadlineOn";
  dir: "asc" | "desc";
}

export async function pageScripts(s: Scoped, q: ScriptPageQuery) {
  assertCan(s.ctx, "script:read");
  const where: Prisma.ScriptWhereInput = {
    ...visibleWhere(s),
    ...(q.status ? { status: q.status } : {}),
    ...(q.contentId ? { contentId: q.contentId } : {}),
    ...(q.q ? { title: { contains: q.q, mode: "insensitive" as const } } : {}),
  };
  const orderBy = [{ [q.sort]: q.dir } as Prisma.ScriptOrderByWithRelationInput, { id: "asc" as const }];
  const [items, total] = await Promise.all([
    s.tx.script.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    s.tx.script.count({ where }),
  ]);
  return { items, total };
}

export async function getScript(s: Scoped, id: string) {
  assertCan(s.ctx, "script:read");
  return s.tx.script.findFirst({ where: { id, ...visibleWhere(s) }, include: { scenes: { orderBy: { position: "asc" } } } });
}

export async function insertScript(s: Scoped, data: ScriptFields & { title: string }) {
  assertCan(s.ctx, "script:write");
  const { referenceLinks, checklist, ...rest } = data;
  return s.tx.script.create({ data: { ...rest, referenceLinks: referenceLinks ?? [], checklist: checklist ?? [], clientId: s.ctx.clientId } });
}

export async function updateScript(s: Scoped, id: string, data: ScriptFields & { status?: ScriptStatus }) {
  assertCan(s.ctx, "script:write");
  const { count } = await s.tx.script.updateMany({ where: { id, clientId: s.ctx.clientId }, data });
  return count;
}

export async function replaceScenes(s: Scoped, scriptId: string, scenes: { dialogue?: string; action?: string; durationSeconds?: number }[]) {
  assertCan(s.ctx, "script:write");
  await s.tx.scriptScene.deleteMany({ where: { clientId: s.ctx.clientId, scriptId } });
  for (const [position, scene] of scenes.entries()) {
    await s.tx.scriptScene.create({ data: { ...scene, position, scriptId, clientId: s.ctx.clientId } });
  }
}

// ---------- Gravacoes ----------

export async function listRecordings(s: Scoped, scriptId: string) {
  assertCan(s.ctx, "script:read");
  return s.tx.recording.findMany({
    where: { clientId: s.ctx.clientId, scriptId, script: visibleWhere(s) },
    select: {
      id: true,
      scriptId: true,
      kind: true,
      externalUrl: true,
      status: true,
      submittedAt: true,
      imageRightsConfirmedAt: true,
      feedback: true,
      reviewedAt: true,
      submittedBy: { select: { name: true } },
    },
    orderBy: { submittedAt: "asc" },
  });
}

export async function getRecording(s: Scoped, id: string) {
  assertCan(s.ctx, "script:read");
  return s.tx.recording.findFirst({ where: { id, clientId: s.ctx.clientId, script: visibleWhere(s) } });
}

/** Gravacao ainda ENVIADA (sem revisao) da mesma pessoa com o mesmo arquivo ou link: base da idempotencia do envio. */
export async function findPendingRecording(s: Scoped, scriptId: string, same: { assetId?: string; url?: string }) {
  assertCan(s.ctx, "script:read");
  return s.tx.recording.findFirst({
    where: {
      clientId: s.ctx.clientId,
      scriptId,
      status: "ENVIADA",
      submittedById: s.ctx.userId,
      ...(same.assetId ? { assetLinks: { some: { assetId: same.assetId } } } : { externalUrl: same.url }),
    },
    select: { id: true },
  });
}

export async function countReceivedRecordings(s: Scoped, scriptId: string): Promise<number> {
  assertCan(s.ctx, "script:read");
  return s.tx.recording.count({ where: { clientId: s.ctx.clientId, scriptId, status: "RECEBIDA" } });
}

export async function insertRecording(s: Scoped, data: { scriptId: string; kind: RecordingKind; externalUrl?: string; imageRightsConfirmedAt?: Date }) {
  assertCan(s.ctx, "recording:submit");
  return s.tx.recording.create({ data: { ...data, clientId: s.ctx.clientId, submittedById: s.ctx.userId } });
}

export async function reviewRecording(s: Scoped, id: string, from: RecordingStatus[], data: { status: RecordingStatus; feedback?: string; reviewedAt: Date }) {
  assertCan(s.ctx, "recording:review");
  const { count } = await s.tx.recording.updateMany({
    where: { id, clientId: s.ctx.clientId, status: { in: from } },
    data: { ...data, reviewedById: s.ctx.userId },
  });
  return count;
}
