// Seed FICTICIO da fase 2 (idempotente; so nexo_dev/nexo_test, quem chama ja recusou outro destino).
// Nada real: nenhum nome, valor, contrato, logo ou link de cliente verdadeiro. Valores e textos sao inventados.
import type { Db } from "../src/server/db/client";
import type { Prisma } from "../src/generated/prisma/client";

type Tx = Prisma.TransactionClient;
import type { ContentFormat, ContentStatus } from "../src/generated/prisma/enums";

const PLAN = {
  code: "essencial-exemplo",
  version: 1,
  name: "Essencial (exemplo)",
  monthlyAmountCents: 150000, // valor ficticio
  monthlyQuota: 12,
  revisionsPerPiece: 2,
  approvalDeadlineBusinessDays: 3,
  scope: "12 publicacoes por mes (3 artes, 4 carrosseis, 3 videos animados, 2 videos humanizados). Plano de exemplo.",
  exclusions: "Trafego pago, producao de video presencial e criacao de logotipo (exemplo).",
};

interface SeedContent {
  title: string;
  format: ContentFormat;
  status: ContentStatus;
  day: number;
  shared?: boolean;
  counts?: boolean;
  bonus?: boolean;
}

const A_CONTENTS: SeedContent[] = [
  { title: "[exemplo] Arte de boas-vindas", format: "ARTE", status: "PLANEJADO", day: 12 },
  { title: "[exemplo] Carrossel de dicas", format: "CARROSSEL", status: "EM_PRODUCAO", day: 14 },
  { title: "[exemplo] Video animado de apresentacao", format: "REEL_ANIMADO", status: "AGUARDANDO_APROVACAO", day: 17, shared: true },
  { title: "[exemplo] Arte de aniversario", format: "ARTE", status: "APROVADO", day: 19, shared: true },
  { title: "[exemplo] Carrossel de bastidores", format: "CARROSSEL", status: "PUBLICADO", day: 5, shared: true },
  { title: "[exemplo] Video humanizado de depoimento", format: "REEL_HUMANIZADO", status: "ANALISADO", day: 3, shared: true },
  { title: "[exemplo] Story de enquete", format: "STORY", status: "PUBLICADO", day: 6, shared: true, counts: false },
  { title: "[exemplo] Arte promocional cancelada", format: "ARTE", status: "CANCELADO", day: 22 },
  { title: "[exemplo] Bonus de fim de mes", format: "ARTE", status: "PLANEJADO", day: 28, bonus: true },
];
const B_CONTENTS: SeedContent[] = [
  { title: "[exemplo B] Carrossel de lancamento", format: "CARROSSEL", status: "AGUARDANDO_APROVACAO", day: 15, shared: true },
  { title: "[exemplo B] Arte institucional", format: "ARTE", status: "PLANEJADO", day: 18 },
];

const SENT: ContentStatus[] = ["AGUARDANDO_APROVACAO", "EM_REVISAO", "APROVADO", "AGENDADO", "PUBLICADO", "ANALISADO"];
const APPROVED: ContentStatus[] = ["APROVADO", "AGENDADO", "PUBLICADO", "ANALISADO"];

async function seedClient(db: Tx, clientSlug: string, ownerEmail: string, planId: string, list: SeedContent[], tag: string) {
  const client = await db.client.findUnique({ where: { slug: clientSlug } });
  const owner = await db.user.findUnique({ where: { email: ownerEmail } });
  const admin = await db.user.findUnique({ where: { email: "admin@nexo-demo.test" } });
  if (!client || !owner || !admin) throw new Error("Seed da fase 1 ausente.");
  const plan = await db.servicePlan.findUniqueOrThrow({ where: { id: planId } });

  let sub = await db.subscription.findFirst({ where: { clientId: client.id, status: "ATIVA" } });
  sub ??= await db.subscription.create({
    data: {
      clientId: client.id,
      planId: plan.id,
      planCode: plan.code,
      planName: plan.name,
      planVersion: plan.version,
      scopeSnapshot: plan.scope,
      exclusionsSnapshot: plan.exclusions,
      amountCents: plan.monthlyAmountCents,
      quota: plan.monthlyQuota,
      revisionsPerPiece: plan.revisionsPerPiece,
      approvalDeadlineBusinessDays: plan.approvalDeadlineBusinessDays,
      startsOn: new Date("2026-11-01T00:00:00Z"),
      billingDay: 10,
    },
  });
  const cycle = await db.editorialCycle.upsert({
    where: { subscriptionId_year_month: { subscriptionId: sub.id, year: 2026, month: 11 } },
    update: {},
    create: { clientId: client.id, subscriptionId: sub.id, year: 2026, month: 11, quota: sub.quota },
  });

  for (const c of list) {
    if (await db.content.findFirst({ where: { clientId: client.id, title: c.title } })) continue;
    const content = await db.content.create({
      data: {
        clientId: client.id,
        cycleId: cycle.id,
        title: c.title,
        format: c.format,
        plannedOn: new Date(`2026-11-${String(c.day).padStart(2, "0")}T00:00:00Z`),
        visibility: c.shared ? "COMPARTILHADO" : "INTERNO",
        countsTowardQuota: c.counts ?? c.format !== "STORY",
        isBonus: c.bonus ?? false,
        internalNotes: `Nota interna ficticia ${tag}`,
      },
    });
    if (SENT.includes(c.status)) {
      const v = await db.contentVersion.create({
        data: { clientId: client.id, contentId: content.id, number: 1, status: "ENVIADA", caption: `Legenda ficticia (${tag})`, cta: "Fale conosco (exemplo)", hashtags: ["exemplo"], authorId: admin.id, sentAt: new Date("2026-11-02T12:00:00Z") },
      });
      await db.content.update({ where: { id: content.id }, data: { currentVersionId: v.id, status: "AGUARDANDO_APROVACAO" } });
      if (APPROVED.includes(c.status)) {
        await db.approval.create({ data: { clientId: client.id, contentId: content.id, versionId: v.id, decision: "APROVADO", authorId: owner.id } });
        await db.content.update({ where: { id: content.id }, data: { status: "APROVADO" } });
      }
    }
    const data: { status?: ContentStatus; publishedAt?: Date; publicationUrl?: string; cancelReason?: string; cancelledAt?: Date } = {};
    if (c.status === "PUBLICADO" || c.status === "ANALISADO") {
      Object.assign(data, { status: c.status, publishedAt: new Date("2026-11-08T15:00:00Z"), publicationUrl: "https://www.instagram.com/p/exemplo-ficticio/" });
    } else if (c.status === "CANCELADO") {
      Object.assign(data, { status: "CANCELADO", cancelReason: "Cancelado no exemplo de dados ficticios", cancelledAt: new Date("2026-11-04T10:00:00Z") });
    } else if (c.status === "EM_PRODUCAO") data.status = "EM_PRODUCAO";
    if (Object.keys(data).length) await db.content.update({ where: { id: content.id }, data });
  }
}

export async function seedPhase2(root: Db) {
  // Os gatilhos tratam conexao sem contexto como "cliente"; o seed roda como escopo de sistema (so dev/teste).
  await root.$transaction(async (db) => {
    await db.$executeRaw`SELECT set_config('app.system', 'on', true)`;
    await seedPhase2In(db);
  });
}

async function seedPhase2In(db: Tx) {
  let plan = await db.servicePlan.findUnique({ where: { code_version: { code: PLAN.code, version: PLAN.version } } });
  plan ??= await db.servicePlan.create({ data: PLAN });
  await seedClient(db, "cliente-a", "dono@cliente-a.test", plan.id, A_CONTENTS, "A");
  await seedClient(db, "cliente-b", "dono@cliente-b.test", plan.id, B_CONTENTS, "B");
}
