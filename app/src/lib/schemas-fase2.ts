import { z } from "zod";

// Entrada da fase 2 (Zod). TODO corpo e `strictObject`: campo desconhecido (clientId, status, authorId, createdAt...)
// vira 422 em vez de ser ignorado, para ninguem "empurrar" campo que a regra nao previu (mass assignment).
// Autor, horario, cliente e papel NUNCA vem do corpo: vem da sessao e do servidor.

const uuid = z.string().uuid("Identificador invalido.");
const text = (max: number, label = "Texto") => z.string().trim().max(max, `${label} muito longo (maximo ${max} caracteres).`);
const reqText = (max: number, label = "Texto") => z.string().trim().min(1, `Informe ${label.toLowerCase()}.`).max(max, `${label} muito longo (maximo ${max} caracteres).`);
const optText = (max: number, label?: string) => text(max, label).optional();
const nullableText = (max: number, label?: string) => text(max, label).nullable().optional();

/** Data civil AAAA-MM-DD que existe de verdade (31/02 nao passa). */
export const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a data no formato AAAA-MM-DD.")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Data inexistente.");

export const toDay = (v: string): Date => new Date(`${v}T00:00:00.000Z`);

const contentFormat = z.enum(["ARTE", "CARROSSEL", "REEL_ANIMADO", "REEL_HUMANIZADO", "STORY", "OUTRO"]);
const channel = z.enum(["INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE", "LINKEDIN", "OUTRO"]);
const contentStatus = z.enum(["PLANEJADO", "EM_PRODUCAO", "AGUARDANDO_APROVACAO", "EM_REVISAO", "APROVADO", "AGENDADO", "PUBLICADO", "ANALISADO", "CANCELADO"]);
const scriptStatus = z.enum(["RASCUNHO", "ENVIADO", "AGUARDANDO_GRAVACAO", "GRAVACAO_RECEBIDA", "EM_EDICAO", "AGUARDANDO_APROVACAO", "FINALIZADO", "PUBLICADO"]);
const visibility = z.enum(["INTERNO", "COMPARTILHADO"]);
export const reason = reqText(1000, "A justificativa");

// ---------- plano, assinatura, ciclo ----------

const planFields = {
  name: reqText(120, "O nome"),
  monthlyAmountCents: z.number().int().min(0).max(1_000_000_000),
  monthlyQuota: z.number().int().min(0).max(1000),
  revisionsPerPiece: z.number().int().min(0).max(50),
  approvalDeadlineBusinessDays: z.number().int().min(0).max(90),
  scope: reqText(4000, "O escopo"),
  exclusions: text(4000).default(""),
};
export const planBody = z.strictObject({ code: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, "Use de 2 a 40 letras minusculas, numeros e hifen."), ...planFields });
export const planVersionBody = z.strictObject(planFields);

export const subscriptionBody = z.strictObject({
  planId: uuid,
  startsOn: isoDay,
  endsOn: isoDay.nullable().optional(),
  billingDay: z.number().int().min(1).max(28),
});
export const subscriptionPatchBody = z
  .strictObject({ status: z.enum(["ATIVA", "PAUSADA", "ENCERRADA"]).optional(), endsOn: isoDay.nullable().optional(), billingDay: z.number().int().min(1).max(28).optional() })
  .refine((v) => Object.keys(v).length > 0, "Informe pelo menos um campo.");

export const cycleBody = z.strictObject({
  subscriptionId: uuid,
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  quota: z.number().int().min(0).max(1000).optional(),
  reason: optText(1000, "A justificativa"),
});
export const quotaBody = z.strictObject({ quota: z.number().int().min(0).max(1000), reason });
export const reasonBody = z.strictObject({ reason });

// ---------- conteudo ----------

export const contentBody = z.strictObject({
  cycleId: uuid,
  title: reqText(200, "O titulo"),
  description: optText(4000),
  format: contentFormat,
  channel: channel.optional(),
  objective: optText(1000),
  pillar: optText(200),
  plannedOn: isoDay,
  assigneeId: uuid.optional(),
  countsTowardQuota: z.boolean().optional(),
});
export const planningPatchBody = z
  .strictObject({
    title: reqText(200, "O titulo").optional(),
    description: nullableText(4000),
    pillar: nullableText(200),
    objective: nullableText(1000),
    internalNotes: nullableText(4000),
    assigneeId: uuid.nullable().optional(),
    assigneeVisibleToClient: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Informe pelo menos um campo.");
export const classificationBody = z
  .strictObject({ countsTowardQuota: z.boolean().optional(), isBonus: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "Informe pelo menos um campo.");
export const visibilityBody = z.strictObject({ visibility });
export const rescheduleBody = z.strictObject({ plannedOn: isoDay });
export const moveCycleBody = z.strictObject({ cycleId: uuid, reason });
export const materialBody = z
  .strictObject({
    caption: nullableText(5000, "A legenda"),
    cta: nullableText(300, "O CTA"),
    hashtags: z.array(reqText(100, "A hashtag")).max(60).optional(),
    briefing: nullableText(5000, "O briefing"),
    format: contentFormat.optional(),
    channel: channel.optional(),
    /** Versao em que a pessoa estava trabalhando: se mudou, 409 (versao desatualizada). */
    expectedVersionId: uuid.nullable().optional(),
  })
  .refine((v) => Object.keys(v).filter((k) => k !== "expectedVersionId").length > 0, "Informe pelo menos um campo do material.");
export const sendBody = z.strictObject({ expectedVersionId: uuid.optional() });
export const statusBody = z.strictObject({
  to: contentStatus,
  cancelReason: optText(1000, "A justificativa"),
  publishedAt: z.string().datetime({ offset: true }).optional(),
  publicationUrl: optText(2048),
});
export const commentBody = z.strictObject({ body: reqText(2000, "O comentario"), visibility: visibility.optional(), versionId: uuid.optional() });
export const decisionBody = z.strictObject({ decision: z.enum(["APROVADO", "REVISAO_SOLICITADA"]), comment: optText(2000, "O comentario") });

// ---------- roteiro e gravacao ----------

const scene = z.strictObject({ dialogue: optText(4000), action: optText(4000), durationSeconds: z.number().int().min(0).max(36000).optional() });
const checklistItem = z.strictObject({ text: reqText(300), done: z.boolean() });
const scriptFields = {
  contentId: uuid.nullable().optional(),
  objective: nullableText(2000),
  plannedDurationSeconds: z.number().int().min(0).max(36000).nullable().optional(),
  assigneeId: uuid.nullable().optional(),
  deadlineOn: isoDay.nullable().optional(),
  location: nullableText(300),
  equipment: nullableText(1000),
  audioNotes: nullableText(2000),
  lightNotes: nullableText(2000),
  framingNotes: nullableText(2000),
  referenceLinks: z.array(z.string().max(2048)).max(30).optional(),
  checklist: z.array(checklistItem).max(100).optional(),
};
export const scriptBody = z.strictObject({ title: reqText(200, "O titulo"), ...scriptFields, scenes: z.array(scene).max(100).optional() });
export const scriptPatchBody = z
  .strictObject({ title: reqText(200, "O titulo").optional(), ...scriptFields, scenes: z.array(scene).max(100).optional() })
  .refine((v) => Object.keys(v).length > 0, "Informe pelo menos um campo.");
export const scriptStatusBody = z.strictObject({ to: scriptStatus, rerecording: z.boolean().optional(), justification: optText(1000, "A justificativa") });
export const recordingBody = z
  .strictObject({ assetId: uuid.optional(), url: optText(2048), imageRightsConfirmed: z.boolean().optional() })
  .refine((v) => (v.assetId ? 1 : 0) + (v.url ? 1 : 0) === 1, "Informe um arquivo OU um link.");
export const rerecordingBody = z.strictObject({ justification: reqText(1000, "A justificativa") });

// ---------- arquivos ----------

export const assetInitBody = z.strictObject({
  originalName: z.string().min(1).max(255),
  mimeType: z.string().trim().min(3).max(100),
  bytes: z.number().int().positive().max(10 * 1024 * 1024 * 1024),
  visibility: visibility.optional(),
});
export const assetPatchBody = z.strictObject({ visibility });
export const attachBody = z
  .strictObject({
    role: z.enum(["PREVIA", "FINAL", "REFERENCIA", "PDF_ROTEIRO", "GRAVACAO", "EVIDENCIA"]),
    position: z.number().int().min(0).max(1000).optional(),
    versionId: uuid.optional(),
    scriptId: uuid.optional(),
    recordingId: uuid.optional(),
    contentId: uuid.optional(),
  })
  .refine((v) => [v.versionId, v.scriptId, v.recordingId, v.contentId].filter(Boolean).length === 1, "Informe exatamente um destino.");
// D-0025: link de midia externo. A URL aqui so e aparada; a validacao real (https, lista de dominios) e do servidor
// (domain/media-link.ts) e devolve a mensagem em `fields.url`.
export const MEDIA_KINDS = ["IMAGEM", "VIDEO", "PDF", "DOCUMENTO", "OUTRO"] as const;
const mediaLabel = z
  .string({ error: "Informe um titulo curto." })
  .trim()
  .min(1, "Informe um titulo curto.")
  .max(120, "O titulo pode ter no maximo 120 caracteres.")
  .refine((v) => !/\p{Cc}/u.test(v), "O titulo nao pode ter caracteres de controle.");
const mediaFields = {
  label: mediaLabel,
  url: z.string({ error: "Cole o link da midia." }).trim().max(4096, "O link e longo demais."),
  kind: z.enum(MEDIA_KINDS, { error: "Escolha o tipo da midia." }),
};
export const mediaLinkBody = z
  .strictObject({ ...mediaFields, versionId: uuid.optional(), scriptId: uuid.optional(), recordingId: uuid.optional() })
  .refine((v) => [v.versionId, v.scriptId, v.recordingId].filter(Boolean).length === 1, "Informe exatamente um destino.");
export const portalMediaLinkBody = z.strictObject({ ...mediaFields, recordingId: uuid });
export const mediaLinkListQuery = z.object({ versionId: uuid.optional(), scriptId: uuid.optional(), recordingId: uuid.optional() });

export const reorderBody = z.strictObject({ position: z.number().int().min(0).max(1000) });

// ---------- consultas ----------

const pageFields = {
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  dir: z.enum(["asc", "desc"]).default("asc"),
};
const search = z.string().trim().max(100).optional().transform((v) => (v ? v : undefined));

export const contentListQuery = z.object({
  ...pageFields,
  sort: z.enum(["plannedOn", "title", "status", "createdAt"]).default("plannedOn"),
  status: contentStatus.optional(),
  format: contentFormat.optional(),
  cycleId: uuid.optional(),
  visibility: visibility.optional(),
  from: isoDay.optional(),
  to: isoDay.optional(),
  q: search,
});
export const scriptListQuery = z.object({
  ...pageFields,
  sort: z.enum(["createdAt", "title", "status", "deadlineOn"]).default("createdAt"),
  status: scriptStatus.optional(),
  contentId: uuid.optional(),
  q: search,
});
export const assetListQuery = z.object({
  ...pageFields,
  sort: z.enum(["createdAt", "originalName", "bytes"]).default("createdAt"),
  status: z.enum(["PENDENTE", "DISPONIVEL", "REJEITADO"]).optional(),
  category: z.enum(["IMAGEM", "VIDEO", "DOCUMENTO"]).optional(),
  versionId: uuid.optional(),
  scriptId: uuid.optional(),
  recordingId: uuid.optional(),
  q: search,
});
export const portalPlanQuery = z.object({ cycleId: uuid.optional() });
export const cycleListQuery = z.object({ ...pageFields, status: z.enum(["ABERTO", "ENCERRADO"]).optional(), subscriptionId: uuid.optional() });
export const subscriptionListQuery = z.object({ ...pageFields, status: z.enum(["ATIVA", "PAUSADA", "ENCERRADA"]).optional() });
export const calendarQuery = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  format: contentFormat.optional(),
  status: contentStatus.optional(),
});
