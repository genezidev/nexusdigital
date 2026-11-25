import { z } from "zod";

// Formularios da fase 2 (React Hook Form + Zod). Os campos do navegador sao TEXTO; aqui eles viram numero, data e
// lista antes de ir para a API. A validacao daqui e para dar erro junto do campo; quem decide e o servidor
// (o corpo vai de novo por `strictObject` em schemas-fase2.ts).

/** "1.200,50" | "1200,5" | "1200" -> centavos inteiros; null se nao for dinheiro valido. Nunca usa ponto flutuante. */
export function parseMoneyToCents(input: string): number | null {
  const raw = input.trim().replace(/^R\$\s*/i, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(raw)) return null;
  const [intPart, frac = ""] = raw.replace(/\./g, "").split(",");
  const cents = Number(intPart) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** "a b, c" -> ["a","b","c"] sem repetir e sem vazios; cada item sem "#" inicial duplicado. */
export function parseHashtags(input: string): string[] {
  const out: string[] = [];
  for (const part of input.split(/[\s,;]+/)) {
    const tag = part.trim();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

export const parseLines = (input: string): string[] =>
  input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data.")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Data inexistente.");
const optionalDay = z.union([z.literal(""), day]);

const intText = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Informe ${label}.`)
    .regex(/^\d+$/, `${label[0].toUpperCase()}${label.slice(1)}: use só números inteiros.`)
    .transform(Number)
    .pipe(z.number().min(min, `Mínimo ${min}.`).max(max, `Máximo ${max}.`));
const optionalIntText = (label: string, min: number, max: number) =>
  z.union([z.literal("").transform(() => undefined), intText(label, min, max)]);

const reqText = (label: string, max: number) => z.string().trim().min(1, `Informe ${label}.`).max(max, `Máximo de ${max} caracteres.`);
const optText = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`);

export const REASON_MIN = 10;
export const reasonField = (min = REASON_MIN) =>
  z.string().trim().min(min, min === 1 ? "Escreva o comentário." : `Explique com pelo menos ${min} caracteres.`).max(1000, "Máximo de 1000 caracteres.");
export const reasonForm = (min = REASON_MIN) => z.object({ reason: reasonField(min) });

export const planForm = z.object({
  code: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,39}$/, "Use de 2 a 40 letras minúsculas, números e hífen (ex.: essencial)."),
  name: reqText("o nome", 120),
  amount: z
    .string()
    .trim()
    .min(1, "Informe o valor mensal.")
    .transform((v, ctx) => {
      const cents = parseMoneyToCents(v);
      if (cents === null) ctx.addIssue({ code: "custom", message: "Valor inválido. Exemplo: 1.200,00" });
      return cents ?? 0;
    }),
  quota: intText("a cota mensal", 0, 1000),
  revisions: intText("as revisões por peça", 0, 50),
  deadline: intText("o prazo de aprovação", 0, 90),
  scope: reqText("o escopo", 4000),
  exclusions: optText(4000),
});
export const planVersionForm = planForm.omit({ code: true });

export const subscriptionForm = z.object({
  planId: z.string().uuid("Escolha um plano."),
  startsOn: day,
  endsOn: optionalDay,
  billingDay: intText("o dia de cobrança", 1, 28),
});

export const cycleForm = z.object({
  year: intText("o ano", 2020, 2100),
  month: intText("o mês", 1, 12),
  quota: optionalIntText("a cota", 0, 1000),
  reason: optText(1000),
});
export const quotaForm = z.object({ quota: intText("a cota", 0, 1000), reason: reasonField() });

export const contentForm = z.object({
  cycleId: z.string().uuid("Escolha o ciclo."),
  title: reqText("o título", 200),
  format: z.enum(["ARTE", "CARROSSEL", "REEL_ANIMADO", "REEL_HUMANIZADO", "STORY", "OUTRO"]),
  channel: z.enum(["INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE", "LINKEDIN", "OUTRO"]),
  plannedOn: day,
  pillar: optText(200),
  objective: optText(1000),
  description: optText(4000),
  assigneeId: z.string(),
  countsTowardQuota: z.boolean(),
});

export const planningForm = z.object({
  title: reqText("o título", 200),
  description: optText(4000),
  pillar: optText(200),
  objective: optText(1000),
  internalNotes: optText(4000),
  assigneeId: z.string(),
  assigneeVisibleToClient: z.boolean(),
});

export const materialForm = z.object({
  caption: optText(5000),
  cta: optText(300),
  hashtags: z.string().max(3000, "Hashtags demais."),
  briefing: optText(5000),
});

export const publishForm = z.object({
  publishedOn: day,
  publicationUrl: optText(2048),
});

export const commentForm = z.object({ body: reqText("o comentário", 2000), visibility: z.enum(["INTERNO", "COMPARTILHADO"]) });

export const sceneForm = z.object({ dialogue: optText(4000), action: optText(4000), durationSeconds: optionalIntText("a duração", 0, 36000) });
export const scriptForm = z.object({
  title: reqText("o título", 200),
  objective: optText(2000),
  plannedDurationSeconds: optionalIntText("a duração prevista", 0, 36000),
  deadlineOn: optionalDay,
  location: optText(300),
  equipment: optText(1000),
  audioNotes: optText(2000),
  lightNotes: optText(2000),
  framingNotes: optText(2000),
  referenceLinks: z.string().max(6000),
  assigneeId: z.string(),
  contentId: z.string(),
  scenes: z.array(sceneForm).max(100, "No máximo 100 cenas."),
});

export const recordingLinkForm = z.object({
  url: z.string().trim().min(1, "Cole o link da gravação.").max(2048, "Link longo demais."),
  imageRights: z.boolean(),
});

export type PlanFormInput = z.input<typeof planForm>;
export type PlanFormOutput = z.output<typeof planForm>;
export type ScriptFormInput = z.input<typeof scriptForm>;
export type ScriptFormOutput = z.output<typeof scriptForm>;
