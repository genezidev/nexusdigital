import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { ownerDb, makeUser, addMember, type World } from "./world";

/** Fixtures da fase 2 pela conexao do dono, em escopo de sistema (os gatilhos tratam conexao sem contexto como cliente). */
export async function sys<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return ownerDb.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.system', 'on', true)`;
    return fn(tx);
  });
}

const tag = () => randomUUID().slice(0, 8);

export const MARKS = (t: string) => ({
  sharedCaption: `LEGENDA-PUBLICA-${t}`,
  internalNote: `NOTA-INTERNA-${t}`,
  objective: `OBJETIVO-INTERNO-${t}`,
  draft: `RASCUNHO-SECRETO-${t}`,
  commentPublic: `COMENT-PUB-${t}`,
  commentInternal: `COMENT-INTERNO-${t}`,
  briefing: `BRIEFING-INTERNO-${t}`,
});

export interface Phase2Data {
  tag: string;
  planId: string;
  subscriptionId: string;
  cycleId: string;
  contentShared: string;
  contentInternal: string;
  versionSent: string;
  versionDraft: string;
  approval: string;
  commentPublic: string;
  commentInternal: string;
  scriptSent: string;
  scriptDraft: string;
  scene: string;
  recording: string;
  assetAvailable: string;
  assetPending: string;
  link: string;
  linkSent: string;
  marks: ReturnType<typeof MARKS>;
}

export async function makePlan(label = "plano") {
  const code = `${label}-${tag()}`;
  return ownerDb.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.system', 'on', true)`;
    return tx.servicePlan.create({
      data: { code, version: 1, name: `Plano ${code}`, monthlyAmountCents: 100000, monthlyQuota: 12, revisionsPerPiece: 2, approvalDeadlineBusinessDays: 3, scope: "Escopo ficticio", exclusions: "Exclusoes ficticias" },
    });
  });
}

/** Um conjunto completo de linhas de TODAS as tabelas da fase 2 para um cliente. */
export async function makePhase2(clientId: string, adminId: string, ownerId: string, planId?: string): Promise<Phase2Data> {
  const t = tag();
  const marks = MARKS(t);
  const plan = planId ? { id: planId } : await makePlan();
  return sys(async (tx) => {
    const sub = await tx.subscription.create({
      data: {
        clientId, planId: plan.id, planCode: "essencial-exemplo", planName: "Plano de exemplo", planVersion: 1, scopeSnapshot: "Escopo ficticio",
        amountCents: 100000, quota: 12, revisionsPerPiece: 2, approvalDeadlineBusinessDays: 3, startsOn: new Date("2026-11-01T00:00:00Z"), billingDay: 10,
      },
    });
    const cycle = await tx.editorialCycle.create({ data: { clientId, subscriptionId: sub.id, year: 2026, month: 11, quota: 12 } });
    const shared = await tx.content.create({
      data: { clientId, cycleId: cycle.id, title: `Conteudo compartilhado ${t}`, format: "ARTE", plannedOn: new Date("2026-11-20T00:00:00Z"), visibility: "COMPARTILHADO", internalNotes: marks.internalNote, objective: marks.objective, pillar: `PILAR-${t}` },
    });
    const vSent = await tx.contentVersion.create({
      data: { clientId, contentId: shared.id, number: 1, status: "RASCUNHO", caption: marks.sharedCaption, cta: "cta", hashtags: ["x"], briefing: marks.briefing, authorId: adminId },
    });
    const internal = await tx.content.create({
      data: { clientId, cycleId: cycle.id, title: `Conteudo interno ${t}`, format: "CARROSSEL", plannedOn: new Date("2026-11-21T00:00:00Z"), status: "EM_PRODUCAO" },
    });
    const vDraft = await tx.contentVersion.create({ data: { clientId, contentId: internal.id, number: 1, status: "RASCUNHO", caption: marks.draft, authorId: adminId } });
    // Aprovacao existente: num terceiro conteudo, para nao atrapalhar o fluxo do conteudo compartilhado.
    const decided = await tx.content.create({ data: { clientId, cycleId: cycle.id, title: `Conteudo decidido ${t}`, format: "ARTE", plannedOn: new Date("2026-11-22T00:00:00Z"), visibility: "COMPARTILHADO" } });
    const vDecided = await tx.contentVersion.create({ data: { clientId, contentId: decided.id, number: 1, status: "ENVIADA", caption: "decidida", authorId: adminId, sentAt: new Date() } });
    await tx.content.update({ where: { id: decided.id }, data: { currentVersionId: vDecided.id, status: "AGUARDANDO_APROVACAO" } });
    const approval = await tx.approval.create({ data: { clientId, contentId: decided.id, versionId: vDecided.id, decision: "APROVADO", authorId: ownerId } });
    await tx.content.update({ where: { id: decided.id }, data: { status: "APROVADO" } });
    const cPub = await tx.comment.create({ data: { clientId, contentId: shared.id, authorId: adminId, body: marks.commentPublic, visibility: "COMPARTILHADO" } });
    const cInt = await tx.comment.create({ data: { clientId, contentId: shared.id, authorId: adminId, body: marks.commentInternal, visibility: "INTERNO" } });
    const scriptSent = await tx.script.create({ data: { clientId, title: `Roteiro visivel ${t}`, status: "AGUARDANDO_GRAVACAO" } });
    const scriptDraft = await tx.script.create({ data: { clientId, title: `Roteiro rascunho ${t}`, objective: marks.objective, status: "RASCUNHO" } });
    const scene = await tx.scriptScene.create({ data: { clientId, scriptId: scriptSent.id, position: 0, dialogue: "fala", action: "acao" } });
    const recording = await tx.recording.create({ data: { clientId, scriptId: scriptSent.id, kind: "LINK", externalUrl: "https://drive.google.com/file/d/ficticio", submittedById: ownerId } });
    const assetOk = await tx.asset.create({
      data: { clientId, storageKey: `clients/${clientId}/${randomUUID()}`, mimeType: "image/png", category: "IMAGEM", bytes: 1234, checksumSha256: "a".repeat(64), originalName: "arte.png", uploadedById: adminId, status: "DISPONIVEL", visibility: "COMPARTILHADO", finalizedAt: new Date() },
    });
    const assetPending = await tx.asset.create({ data: { clientId, storageKey: `clients/${clientId}/${randomUUID()}`, originalName: "pendente.png", uploadedById: ownerId, visibility: "COMPARTILHADO" } });
    // Vinculo na versao RASCUNHO (versao enviada nao aceita vinculo novo), mais um na gravacao.
    const link = await tx.assetLink.create({ data: { clientId, assetId: assetOk.id, versionId: vDraft.id, role: "PREVIA" } });
    const linkSent = await tx.assetLink.create({ data: { clientId, assetId: assetOk.id, versionId: vSent.id, role: "PREVIA" } });
    await tx.contentVersion.update({ where: { id: vSent.id }, data: { status: "ENVIADA", sentAt: new Date() } });
    await tx.content.update({ where: { id: shared.id }, data: { currentVersionId: vSent.id, status: "AGUARDANDO_APROVACAO" } });
    return {
      tag: t,
      planId: plan.id,
      subscriptionId: sub.id,
      cycleId: cycle.id,
      contentShared: shared.id,
      contentInternal: internal.id,
      versionSent: vSent.id,
      versionDraft: vDraft.id,
      approval: approval.id,
      commentPublic: cPub.id,
      commentInternal: cInt.id,
      scriptSent: scriptSent.id,
      scriptDraft: scriptDraft.id,
      scene: scene.id,
      recording: recording.id,
      assetAvailable: assetOk.id,
      assetPending: assetPending.id,
      link: link.id,
      linkSent: linkSent.id,
      marks,
    };
  });
}

export async function makeStaffAssigned(clientId: string, label = "staff-x") {
  const u = await makeUser("STAFF", label);
  await addMember(clientId, u.id, "STAFF");
  return u;
}

export async function makeCollaboratorWithApproval(clientId: string) {
  const u = await makeUser("USER", "colab-aprova");
  const m = await addMember(clientId, u.id, "CLIENT_COLLABORATOR");
  await ownerDb.clientMember.update({ where: { id: m.id }, data: { permissions: ["content:approve"] } });
  return u;
}

export type { World };

/** Conteudo compartilhado AGUARDANDO_APROVACAO com uma versao ENVIADA atual (para testes de decisao). */
export async function makeAwaitingContent(clientId: string, cycleId: string, adminId: string, status: "AGUARDANDO_APROVACAO" | "EM_PRODUCAO" = "AGUARDANDO_APROVACAO") {
  const t = tag();
  return sys(async (tx) => {
    const content = await tx.content.create({ data: { clientId, cycleId, title: `Aguardando ${t}`, format: "ARTE", plannedOn: new Date("2026-11-15T00:00:00Z"), visibility: "COMPARTILHADO" } });
    const version = await tx.contentVersion.create({ data: { clientId, contentId: content.id, number: 1, status: "ENVIADA", caption: `legenda ${t}`, authorId: adminId, sentAt: new Date() } });
    await tx.content.update({ where: { id: content.id }, data: { currentVersionId: version.id, status } });
    return { contentId: content.id, versionId: version.id };
  });
}
