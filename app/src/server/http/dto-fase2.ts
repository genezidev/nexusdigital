import { z } from "zod";

// Formato JSON publico da fase 2: ZOD NA SAIDA. Cada recurso tem um esquema para a agencia e outro, menor, para o
// portal. `schema.parse` descarta toda chave que nao esta na lista (z.object remove o que nao declara), entao um
// campo novo no banco nunca vaza por acidente: precisa ser acrescentado aqui de proposito (R-4, R-13).
// Datas viram texto ISO; bigint vira numero; nunca storage_key, hash de token nem dado de outro cliente.

const iso = z.date().transform((d) => d.toISOString());
const isoN = iso.nullable();
const day = z.date().transform((d) => d.toISOString().slice(0, 10));
const dayN = day.nullable();
const big = z.bigint().transform((n) => Number(n));
const bigN = big.nullable();

// ---------- plano, assinatura, ciclo ----------

export const planOut = z.object({
  id: z.string(),
  code: z.string(),
  version: z.number(),
  name: z.string(),
  monthlyAmountCents: z.number(),
  monthlyQuota: z.number(),
  revisionsPerPiece: z.number(),
  approvalDeadlineBusinessDays: z.number(),
  scope: z.string(),
  exclusions: z.string(),
  active: z.boolean(),
  createdAt: iso,
});

export const subscriptionAgencyOut = z.object({
  id: z.string(),
  planId: z.string(),
  planCode: z.string(),
  planName: z.string(),
  planVersion: z.number(),
  scopeSnapshot: z.string(),
  exclusionsSnapshot: z.string(),
  amountCents: z.number(),
  quota: z.number(),
  revisionsPerPiece: z.number(),
  approvalDeadlineBusinessDays: z.number(),
  startsOn: day,
  endsOn: dayN,
  billingDay: z.number(),
  status: z.string(),
  createdAt: iso,
});

// Portal: plano e preco SO do retrato da assinatura (nunca do catalogo); sem dia de cobranca.
export const subscriptionPortalOut = z.object({
  planName: z.string(),
  scopeSnapshot: z.string(),
  exclusionsSnapshot: z.string(),
  amountCents: z.number(),
  quota: z.number(),
  revisionsPerPiece: z.number(),
  approvalDeadlineBusinessDays: z.number(),
  startsOn: day,
  endsOn: dayN,
  status: z.string(),
});

export const cycleAgencyOut = z.object({
  id: z.string(),
  subscriptionId: z.string(),
  year: z.number(),
  month: z.number(),
  quota: z.number(),
  previousQuota: z.number().nullable(),
  quotaChangeReason: z.string().nullable(),
  status: z.string(),
  closedAt: isoN,
  reopenedAt: isoN,
  reopenReason: z.string().nullable(),
  createdAt: iso,
});

const funnel = z.object({ planned: z.number(), produced: z.number(), approved: z.number(), published: z.number() });

export const progressAgencyOut = z.object({
  quota: z.number(),
  hasQuota: z.boolean(),
  percent: z.number().nullable(),
  surplus: z.number(),
  planned: z.number(),
  produced: z.number(),
  approved: z.number(),
  published: z.number(),
  outsideQuota: funnel,
  source: z.enum(["live", "snapshot"]),
});

// Portal: SO NUMEROS. Nada de titulos, classificacao de cota nem pecas ainda internas.
export const progressPortalOut = z.object({
  quota: z.number(),
  hasQuota: z.boolean(),
  percent: z.number().nullable(),
  surplus: z.number(),
  planned: z.number(),
  produced: z.number(),
  approved: z.number(),
  published: z.number(),
});

export const cyclePortalOut = z.object({ id: z.string(), year: z.number(), month: z.number(), quota: z.number(), status: z.string() });

// ---------- conteudo ----------

export const contentAgencyOut = z.object({
  id: z.string(),
  cycleId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  format: z.string(),
  channel: z.string(),
  objective: z.string().nullable(),
  pillar: z.string().nullable(),
  plannedOn: day,
  publishedAt: isoN,
  publicationUrl: z.string().nullable(),
  assigneeId: z.string().nullable(),
  assigneeVisibleToClient: z.boolean(),
  status: z.string(),
  visibility: z.string(),
  countsTowardQuota: z.boolean(),
  isBonus: z.boolean(),
  currentVersionId: z.string().nullable(),
  internalNotes: z.string().nullable(),
  cancelReason: z.string().nullable(),
  cancelledAt: isoN,
  createdAt: iso,
  updatedAt: iso,
});

// Lista explicita do cliente (spec 0002): sem descricao interna, objetivo, pilar, notas, classificacao, responsavel
// (so o NOME, e so quando a agencia marcou) nem justificativa interna.
export const contentPortalOut = z.object({
  id: z.string(),
  cycleId: z.string(),
  title: z.string(),
  format: z.string(),
  channel: z.string(),
  plannedOn: day,
  publishedAt: isoN,
  publicationUrl: z.string().nullable(),
  status: z.string(),
  currentVersionId: z.string().nullable(),
  assigneeName: z.string().nullable(),
});

export const calendarItemOut = z.object({ id: z.string(), title: z.string(), format: z.string(), channel: z.string(), status: z.string(), plannedOn: day });

export const versionAgencyOut = z.object({
  id: z.string(),
  contentId: z.string(),
  number: z.number(),
  status: z.string(),
  caption: z.string().nullable(),
  cta: z.string().nullable(),
  hashtags: z.array(z.string()),
  briefing: z.string().nullable(),
  authorId: z.string(),
  sentAt: isoN,
  createdAt: iso,
});

export const versionPortalOut = z.object({
  id: z.string(),
  contentId: z.string(),
  number: z.number(),
  status: z.string(),
  caption: z.string().nullable(),
  cta: z.string().nullable(),
  hashtags: z.array(z.string()),
  sentAt: isoN,
});

export const approvalOut = z.object({
  id: z.string(),
  contentId: z.string(),
  versionId: z.string(),
  decision: z.string(),
  comment: z.string().nullable(),
  createdAt: iso,
  invalidatedAt: isoN,
  invalidationReason: z.string().nullable(),
  authorName: z.string(),
});

export const commentOut = z.object({
  id: z.string(),
  contentId: z.string().nullable(),
  scriptId: z.string().nullable(),
  versionId: z.string().nullable(),
  body: z.string(),
  visibility: z.string(),
  createdAt: iso,
  authorName: z.string(),
});

// ---------- arquivos ----------

const assetBase = {
  id: z.string(),
  originalName: z.string(),
  mimeType: z.string().nullable(),
  category: z.string().nullable(),
  bytes: bigN,
  status: z.string(),
  createdAt: iso,
};
export const assetPortalOut = z.object(assetBase);
export const assetAgencyOut = z.object({
  ...assetBase,
  visibility: z.string(),
  scanStatus: z.string(),
  checksumSha256: z.string().nullable(),
  uploadedById: z.string(),
  finalizedAt: isoN,
});
export const linkedAssetPortalOut = z.object({
  link: z.object({ id: z.string(), role: z.string(), position: z.number(), versionId: z.string().nullable(), scriptId: z.string().nullable(), recordingId: z.string().nullable() }),
  asset: assetPortalOut,
});
export const linkedAssetAgencyOut = z.object({
  link: z.object({ id: z.string(), role: z.string(), position: z.number(), versionId: z.string().nullable(), scriptId: z.string().nullable(), recordingId: z.string().nullable(), contentId: z.string().nullable() }),
  asset: assetAgencyOut,
});

// ---------- roteiro e gravacao ----------

const sceneOut = z.object({ id: z.string(), position: z.number(), dialogue: z.string().nullable(), action: z.string().nullable(), durationSeconds: z.number().nullable() });
const scriptShared = {
  id: z.string(),
  title: z.string(),
  objective: z.string().nullable(),
  plannedDurationSeconds: z.number().nullable(),
  deadlineOn: dayN,
  location: z.string().nullable(),
  equipment: z.string().nullable(),
  vertical916: z.boolean(),
  audioNotes: z.string().nullable(),
  lightNotes: z.string().nullable(),
  framingNotes: z.string().nullable(),
  referenceLinks: z.unknown(),
  checklist: z.unknown(),
  status: z.string(),
};
export const scriptPortalOut = z.object({ ...scriptShared, scenes: z.array(sceneOut).optional() });
export const scriptAgencyOut = z.object({
  ...scriptShared,
  contentId: z.string().nullable(),
  assigneeId: z.string().nullable(),
  createdAt: iso,
  updatedAt: iso,
  scenes: z.array(sceneOut).optional(),
});

export const recordingOut = z.object({
  id: z.string(),
  scriptId: z.string(),
  kind: z.string(),
  externalUrl: z.string().nullable(),
  status: z.string(),
  submittedAt: iso,
  imageRightsConfirmedAt: isoN,
  feedback: z.string().nullable(),
  reviewedAt: isoN,
  submittedBy: z.object({ name: z.string() }).transform((u) => u.name),
});

// ---------- ajudantes ----------

export function page<T>(items: T[], total: number, pageNumber: number, pageSize: number) {
  return { items, total, page: pageNumber, pageSize };
}
