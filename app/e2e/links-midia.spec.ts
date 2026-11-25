import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { apiOk, loginAdmin, loginAs, seedRich, type Rich } from "./helpers/fase2";

// D-0025 / R-23 pela interface real: cadastrar link de midia no admin e no portal, ver o aviso, abrir (nova aba, rel
// seguro, sem iframe) e provar que o cliente nao ve link de rascunho interno.

const DRIVE = "https://drive.google.com/file/d/ficticio-e2e-0001/view";
const REL = ["noopener", "noreferrer", "nofollow"];

let rich: Rich;
const open: BrowserContext[] = [];
let admin: Page;
let owner: Page;

test.beforeAll(async ({ browser }) => {
  rich = await seedRich(browser, "Links");
  const a = await loginAdmin(browser);
  open.push(a.context);
  admin = a.page;
  const o = await loginAs(browser, rich.owner.email, "senha-e2e-ficticia-123456");
  open.push(o.context);
  owner = o.page;
});
test.afterAll(async () => {
  for (const c of open) await c.close();
});

async function expectSafeLink(page: Page, hrefStart: string, label: RegExp) {
  const a = page.getByTestId("media-link-item").getByRole("link", { name: label }).first();
  await expect(a).toBeVisible();
  await expect(a).toHaveAttribute("target", "_blank");
  const rel = (await a.getAttribute("rel")) ?? "";
  for (const token of REL) expect(rel.split(/\s+/), `rel de ${label}`).toContain(token);
  expect(await a.getAttribute("href")).toContain(hrefStart);
  // sem iframe, embed ou preview: so o link
  await expect(page.locator("iframe, embed, object")).toHaveCount(0);
}

async function axe(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`), label).toEqual([]);
}

test.describe.serial("link de midia", () => {
  test("agencia cadastra link na versao em rascunho: aviso visivel, endereco recusado mostra erro, link abre com rel seguro", async () => {
    await admin.goto(`/admin/contents/${rich.contents.production}?client=${rich.clientId}`);
    const card = admin.getByRole("heading", { name: "Links de mídia" });
    await expect(card).toBeVisible();
    const form = admin.getByTestId("media-link-form");
    await expect(form.getByTestId("media-link-notice")).toContainText("Deixe o arquivo com acesso “qualquer pessoa com o link”");
    await expect(admin.getByText("Nenhum link de mídia cadastrado.")).toBeVisible();

    // endereco que nao pode: erro junto do campo, nada cadastrado
    await form.getByLabel("Título curto").fill("Link ruim");
    for (const bad of ["http://drive.google.com/x", "javascript:alert(1)", "https://evil-drive.google.com.attacker.com/x"]) {
      await form.getByLabel("Link da mídia").fill(bad);
      await form.getByRole("button", { name: "Adicionar link à versão" }).click();
      await expect(form.getByRole("alert").first()).toBeVisible();
      await expect(admin.getByTestId("media-link-item")).toHaveCount(0);
    }

    await form.getByLabel("Título curto").fill("Prévia do carrossel");
    await form.getByLabel("Tipo").selectOption("IMAGEM");
    await form.getByLabel("Link da mídia").fill(`${DRIVE.toUpperCase().slice(0, 8)}${DRIVE.slice(8)}#`);
    await form.getByRole("button", { name: "Adicionar link à versão" }).click();
    await expect(admin.getByText("Prévia do carrossel")).toBeVisible();
    await expectSafeLink(admin, "https://drive.google.com/file/d/ficticio-e2e-0001/view", /Abrir no Google Drive/);
    await expect(admin.getByTestId("media-link-item").getByRole("link").first()).toContainText("drive.google.com");
    await axe(admin, "admin: conteudo com link de midia");
  });

  test("o cliente nao ve o link enquanto a peca e interna; depois de enviada e compartilhada, ve e abre", async () => {
    // peca interna: nem a pagina existe para o cliente
    await owner.goto(`/portal/contents/${rich.contents.production}`);
    await expect(owner.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
    await expect(owner.getByText("Prévia do carrossel")).toHaveCount(0);

    // a agencia envia para aprovacao e compartilha pelas rotas reais
    const base = `/api/admin/clients/${rich.clientId}`;
    await apiOk(admin, "POST", `${base}/contents/${rich.contents.production}/send`, {});
    await apiOk(admin, "PUT", `${base}/contents/${rich.contents.production}/visibility`, { visibility: "COMPARTILHADO" });

    await owner.goto(`/portal/contents/${rich.contents.production}`);
    await expect(owner.getByRole("heading", { name: "Links de mídia" })).toBeVisible();
    await expectSafeLink(owner, "https://drive.google.com/file/d/ficticio-e2e-0001/view", /Abrir no Google Drive/);
    // a versao enviada e imutavel: nao ha formulario nem botao de remover para o cliente
    await expect(owner.getByTestId("media-link-form")).toHaveCount(0);
    await expect(owner.getByRole("button", { name: /Remover o link/ })).toHaveCount(0);
    await axe(owner, "portal: conteudo com link de midia");
  });

  test("portal: o cliente envia a gravacao por link, adiciona outro link de midia, ve o aviso e remove", async () => {
    await apiOk(owner, "POST", `/api/portal/scripts/${rich.scriptId}/recordings`, { url: "https://drive.google.com/file/d/gravacao-e2e/view", imageRightsConfirmed: true });
    await owner.goto(`/portal/scripts/${rich.scriptId}`);
    // sem upload (UPLOADS_ENABLED=false e o padrao real; aqui o e2e liga so para as outras jornadas) o link continua valendo
    const details = owner.locator("summary", { hasText: "Adicionar outro link de mídia a esta gravação" });
    await details.click();
    const form = owner.getByTestId("media-link-form");
    await expect(form.getByTestId("media-link-notice")).toHaveText(/Deixe o arquivo com acesso “qualquer pessoa com o link” para a agência conseguir abrir\./);
    await form.getByLabel("Título curto").fill("Bastidores da gravação");
    await form.getByLabel("Tipo").selectOption("VIDEO");
    await form.getByLabel("Link da mídia").fill("https://www.youtube.com/watch?v=ficticio");
    await form.getByRole("button", { name: "Adicionar link" }).click();
    await expect(owner.getByText("Bastidores da gravação")).toBeVisible();
    await expectSafeLink(owner, "https://www.youtube.com/watch?v=ficticio", /Abrir no YouTube/);
    await axe(owner, "portal: roteiro com link de midia");

    // a agencia ve o mesmo link na pagina do roteiro
    await admin.goto(`/admin/scripts/${rich.scriptId}?client=${rich.clientId}`);
    await expect(admin.getByText("Bastidores da gravação")).toBeVisible();

    // o cliente remove o que ele mesmo cadastrou
    await owner.getByRole("button", { name: "Remover o link Bastidores da gravação" }).click();
    await expect(owner.getByText("Bastidores da gravação")).toHaveCount(0);
  });

  test("com o envio de arquivo ligado (so neste app de teste), o aviso nao some e nada de upload e obrigatorio para aprovar", async () => {
    // A aprovacao nunca depende de arquivo: o conteudo abaixo foi enviado SEM arquivo e o cliente decide normalmente.
    const base = `/api/admin/clients/${rich.clientId}`;
    const plain = await apiOk(admin, "POST", `${base}/contents`, { cycleId: rich.cycleId, title: "Peça só com link", format: "ARTE", plannedOn: new Date().toISOString().slice(0, 10) });
    const id = plain.id as string;
    await apiOk(admin, "POST", `${base}/contents/${id}/status`, { to: "EM_PRODUCAO" });
    await apiOk(admin, "PUT", `${base}/contents/${id}/material`, { caption: "Só com link, sem arquivo." });
    await apiOk(admin, "POST", `${base}/contents/${id}/send`, {});
    await apiOk(admin, "PUT", `${base}/contents/${id}/visibility`, { visibility: "COMPARTILHADO" });
    const detail = (await apiOk(owner, "GET", `/api/portal/contents/${id}`)) as { content: { currentVersionId: string } };
    const decided = await apiOk(owner, "POST", `/api/portal/contents/${id}/versions/${detail.content.currentVersionId}/decision`, { decision: "APROVADO" });
    expect(decided.decision).toBe("APROVADO");
  });
});
