import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { addMemberRow, createClientRow, createUserRow, E2E_PASSWORD, tag, withDb } from "./db";
import { ADMIN_EMAIL, loginViaUi, seedPassword } from "./ui";

// Apoio dos testes E2E da fase 2: arquivos de teste com assinaturas reais (conteudo ficticio), chamadas de API como a
// pessoa logada (cookie da sessao do navegador, Origin do app) para montar massa de dados, e a competencia atual.

export const BASE = "http://127.0.0.1:3101";

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const png = (size = 2048): Buffer => Buffer.concat([PNG_HEAD, Buffer.alloc(size - 8, 9)]);
export const pdf = (size = 2048): Buffer => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(size - 9, 32)]);
export const mp4 = (size = 4096): Buffer => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(size - 12, 0)]);
/** HTML ativo com nome de imagem: passa na validacao previa (so olha o nome) e o servidor recusa pelo CONTEUDO. */
export const htmlAsPng = (): Buffer => Buffer.from("<html><body><script>fetch('/api/portal/client')</script></body></html>".padEnd(1500, " "));

/** Ano, mes e dia de hoje no fuso America/Maceio (o mesmo do cliente de teste). */
export function today() {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Maceio", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = iso.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { year: y, month: m, day: d, iso, first: `${y}-${pad(m)}-01`, dayIso: (n: number) => `${y}-${pad(m)}-${pad(n)}` };
}

export interface ApiResult {
  status: number;
  json: Record<string, unknown> | null;
}

/** Chamada de API pela sessao do navegador (cookies do contexto) com o Origin do app, como a tela faria. */
export async function apiCall(page: Page, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<ApiResult> {
  const res = await page.request.fetch(`${BASE}${path}`, { method, headers: { origin: BASE, accept: "application/json" }, ...(body === undefined ? {} : { data: body }) });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: res.status(), json };
}

export async function apiOk(page: Page, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<Record<string, unknown>> {
  const r = await apiCall(page, method, path, body);
  expect(r.status, `${method} ${path} -> ${JSON.stringify(r.json)}`).toBeLessThan(300);
  return r.json ?? {};
}

/** Envia um arquivo pelo fluxo real (pedido de alvo + PUT) e devolve o id do arquivo. `initPath` e a rota de pedido. */
export async function apiUpload(page: Page, initPath: string, file: { name: string; mime: string; data: Buffer }): Promise<string> {
  const init = await apiOk(page, "POST", initPath, { originalName: file.name, mimeType: file.mime, bytes: file.data.length, visibility: "COMPARTILHADO" });
  const put = await page.request.fetch(`${BASE}${init.path as string}`, { method: "PUT", headers: { origin: BASE, "content-type": "application/octet-stream" }, data: file.data });
  expect(put.status(), "PUT dos bytes").toBe(201);
  return init.assetId as string;
}

export async function newPage(browser: Browser, opts: { width?: number; height?: number; dark?: boolean } = {}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL: BASE,
    locale: "pt-BR",
    timezoneId: "America/Maceio",
    viewport: { width: opts.width ?? 1440, height: opts.height ?? 900 },
    colorScheme: opts.dark ? "dark" : "light",
    acceptDownloads: true,
  });
  return { context, page: await context.newPage() };
}

export async function loginAs(browser: Browser, email: string, password: string, opts: Parameters<typeof newPage>[1] = {}) {
  const r = await newPage(browser, opts);
  await loginViaUi(r.page, email, password);
  // Espera a tela inicial terminar de carregar: um goto logo em seguida nao pode ser interrompido pelo redirecionamento.
  await expect(r.page.getByRole("button", { name: /Menu da conta de/ })).toBeVisible();
  await r.page.waitForLoadState("load");
  return r;
}

export async function loginAdmin(browser: Browser, opts: Parameters<typeof newPage>[1] = {}) {
  return loginAs(browser, ADMIN_EMAIL, seedPassword(), opts);
}

export interface Person {
  id: string;
  email: string;
  name: string;
}

export async function makePerson(name: string, role: "USER" | "STAFF" = "USER"): Promise<Person> {
  const p = await createUserRow({ name, role });
  return { ...p, name };
}

export const PASSWORD = E2E_PASSWORD;

/** Remove/define permissoes finas de uma participacao (so por banco: nao existe tela para isso nesta fase). */
export async function setMemberPermissions(clientId: string, userId: string, permissions: string[]): Promise<void> {
  await withDb((c) => c.query("UPDATE client_members SET permissions = $3::text[] WHERE client_id = $1 AND user_id = $2", [clientId, userId, permissions]));
}

export interface Rich {
  clientId: string;
  clientName: string;
  owner: Person;
  collab: Person;
  approver: Person;
  planName: string;
  cycleId: string;
  subscriptionId: string;
  contents: { planned: string; production: string; awaiting: string; awaiting2: string; approved: string; revision: string; published: string; cancelled: string };
  scriptId: string;
  draftScriptId: string;
  pdfAssetId: string;
}

/**
 * Cliente com dados representativos (fictícios) para capturas, acessibilidade e IDOR: plano, assinatura, ciclo,
 * 12 pecas em varios status, arquivo de previa, decisao do cliente, publicacao, dois roteiros com PDF. Tudo pelas
 * rotas reais (nada de SQL), usando a sessao do admin e a do responsavel do cliente.
 */
export async function seedRich(browser: Browser, label = "Rica"): Promise<Rich> {
  const suffix = tag();
  const clientName = `Padaria Pão Quente ${label} ${suffix}`;
  const clientId = await createClientRow(clientName);
  const owner = await makePerson(`Mariana Souza ${suffix}`);
  const collab = await makePerson(`Carlos Lima ${suffix}`);
  const approver = await makePerson(`Joana Prado ${suffix}`);
  await addMemberRow(clientId, owner.id, "CLIENT_OWNER");
  await addMemberRow(clientId, collab.id, "CLIENT_COLLABORATOR");
  await addMemberRow(clientId, approver.id, "CLIENT_COLLABORATOR");
  await setMemberPermissions(clientId, approver.id, ["content:approve"]);

  const admin = await loginAdmin(browser);
  const ownerSession = await loginAs(browser, owner.email, PASSWORD);
  const a = admin.page;
  const t = today();
  const planName = `Essencial (exemplo) ${suffix}`;
  const plan = await apiOk(a, "POST", "/api/admin/plans", {
    code: `essencial-${suffix}`,
    name: planName,
    monthlyAmountCents: 120000,
    monthlyQuota: 12,
    revisionsPerPiece: 2,
    approvalDeadlineBusinessDays: 3,
    scope: "12 publicações por mês: artes, carrosséis e vídeos.\nCalendário editorial mensal.",
    exclusions: "Tráfego pago e produção presencial.",
  });
  const sub = await apiOk(a, "POST", `/api/admin/clients/${clientId}/subscriptions`, { planId: plan.id, startsOn: t.first, billingDay: 10 });
  const cycle = await apiOk(a, "POST", `/api/admin/clients/${clientId}/cycles`, { subscriptionId: sub.id, year: t.year, month: t.month });
  const base = `/api/admin/clients/${clientId}`;
  const FORMATS = ["ARTE", "CARROSSEL", "REEL_ANIMADO", "REEL_HUMANIZADO"] as const;

  const make = async (i: number, title: string, extra: Record<string, unknown> = {}) =>
    (await apiOk(a, "POST", `${base}/contents`, { cycleId: cycle.id, title: `${title} ${suffix}`, format: FORMATS[i % 4], plannedOn: t.dayIso(Math.min(3 + i * 2, 28)), pillar: "Promoções", ...extra })).id as string;
  const material = (id: string, caption: string) => apiOk(a, "PUT", `${base}/contents/${id}/material`, { caption, cta: "Peça pelo WhatsApp", hashtags: ["#padaria", "#pãoquente"], briefing: "BRIEFING-INTERNO-PLANTADO" });
  const toProduction = (id: string) => apiOk(a, "POST", `${base}/contents/${id}/status`, { to: "EM_PRODUCAO" });
  const share = (id: string) => apiOk(a, "PUT", `${base}/contents/${id}/visibility`, { visibility: "COMPARTILHADO" });
  const send = async (id: string) => {
    await toProduction(id);
    const m = await material(id, `Hoje tem pão fresquinho às 7h. Venha provar! (${id.slice(0, 4)})`);
    await apiOk(a, "POST", `${base}/contents/${id}/send`, {});
    await share(id);
    return m.versionId as string;
  };

  const planned = await make(0, "Post de abertura");
  const production = await make(1, "Carrossel de receitas");
  await toProduction(production);
  await material(production, "Rascunho do carrossel (só a agência vê).");
  const awaiting = await make(2, "Reel dos bastidores");
  await toProduction(awaiting);
  const draft = (await material(awaiting, "Bastidores da padaria: do forno à vitrine.")).versionId as string;
  const previewId = await apiUpload(a, `${base}/assets`, { name: "previa.png", mime: "image/png", data: png() });
  await apiOk(a, "POST", `${base}/assets/${previewId}/links`, { role: "PREVIA", position: 0, versionId: draft });
  await apiOk(a, "POST", `${base}/contents/${awaiting}/send`, {});
  await share(awaiting);
  const awaiting2 = await make(3, "Arte da promoção");
  await send(awaiting2);
  const approved = await make(4, "Arte do café da manhã");
  await send(approved);
  const revision = await make(5, "Vídeo do bolo");
  await send(revision);
  const published = await make(6, "Carrossel de dicas");
  const pv = await send(published);

  // Decisoes do cliente (sessao do responsavel do cliente, pela API real).
  const o = ownerSession.page;
  await apiOk(o, "POST", `/api/portal/contents/${approved}/versions/${(await versionOf(a, base, approved)) ?? pv}/decision`, { decision: "APROVADO", comment: "Ficou ótimo!" });
  await apiOk(o, "POST", `/api/portal/contents/${revision}/versions/${await versionOf(a, base, revision)}/decision`, { decision: "REVISAO_SOLICITADA", comment: "Pode deixar o preço maior?" });
  await apiOk(o, "POST", `/api/portal/contents/${published}/versions/${pv}/decision`, { decision: "APROVADO" });
  await apiOk(a, "POST", `${base}/contents/${published}/status`, { to: "PUBLICADO", publishedAt: new Date(`${t.dayIso(Math.max(1, t.day))}T12:00:00-03:00`).toISOString(), publicationUrl: "https://www.instagram.com/p/exemplo-ficticio/" });
  const cancelled = await make(7, "Peça cancelada");
  await apiOk(a, "POST", `${base}/contents/${cancelled}/status`, { to: "CANCELADO", cancelReason: "Cliente decidiu cancelar esta peça" });
  for (let i = 8; i < 12; i++) await make(i, `Peça planejada ${i}`);

  // Roteiros
  const script = (await apiOk(a, "POST", `${base}/scripts`, {
    title: `Roteiro do vídeo institucional ${suffix}`,
    objective: "Apresentar a padaria e a equipe.",
    plannedDurationSeconds: 60,
    deadlineOn: t.dayIso(28),
    location: "Balcão da padaria",
    equipment: "Celular na vertical com tripé",
    audioNotes: "Gravar em local silencioso.",
    lightNotes: "Luz natural da janela.",
    framingNotes: "Vertical 9:16, enquadramento do busto.",
    referenceLinks: ["https://www.youtube.com/watch?v=exemplo"],
    scenes: [
      { dialogue: "Olá! Somos a Padaria Pão Quente.", action: "Plano médio sorrindo", durationSeconds: 15 },
      { dialogue: "Aqui o pão sai quentinho toda manhã.", action: "Mostrar a vitrine", durationSeconds: 20 },
    ],
  })).id as string;
  const pdfAsset = await apiUpload(a, `${base}/assets`, { name: "roteiro.pdf", mime: "application/pdf", data: pdf() });
  await apiOk(a, "POST", `${base}/assets/${pdfAsset}/links`, { role: "PDF_ROTEIRO", scriptId: script });
  await apiOk(a, "POST", `${base}/scripts/${script}/status`, { to: "ENVIADO" });
  await apiOk(a, "POST", `${base}/scripts/${script}/status`, { to: "AGUARDANDO_GRAVACAO" });
  const draftScript = (await apiOk(a, "POST", `${base}/scripts`, { title: `Roteiro em rascunho ${suffix}`, scenes: [{ dialogue: "ROTEIRO-RASCUNHO-PLANTADO" }] })).id as string;

  await admin.context.close();
  await ownerSession.context.close();
  return {
    clientId,
    clientName,
    owner,
    collab,
    approver,
    planName,
    cycleId: cycle.id as string,
    subscriptionId: sub.id as string,
    contents: { planned, production, awaiting, awaiting2, approved, revision, published, cancelled },
    scriptId: script,
    draftScriptId: draftScript,
    pdfAssetId: pdfAsset,
  };
}

async function versionOf(admin: Page, base: string, contentId: string): Promise<string> {
  const d = await apiOk(admin, "GET", `${base}/contents/${contentId}`);
  const c = d.content as { currentVersionId: string };
  return c.currentVersionId;
}

/**
 * Escolhe o arquivo no seletor da tela e espera a tela reagir (nome do arquivo ou mensagem de erro). Sem isso, um
 * `setInputFiles` feito antes da hidratacao do React perde o evento de mudanca e o teste fica esperando.
 */
export async function chooseFile(page: Page, label: string, file: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
  const root = page.getByTestId("file-uploader").filter({ has: page.getByLabel(label) });
  await expect(async () => {
    await root.getByLabel(label).setInputFiles(file);
    await expect(root.getByTestId("uploader-file").or(root.getByRole("alert")).first()).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
}
