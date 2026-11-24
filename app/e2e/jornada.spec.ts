import { expect, test, type Browser, type Page } from "@playwright/test";
import { tag } from "./helpers/db";
import { ADMIN_EMAIL, loginViaUi, logoutViaUi, seedPassword } from "./helpers/ui";

// Jornada P1 + P2 + P3 pela interface real: o admin cadastra Cliente A e Cliente B, convida uma pessoa em
// cada um, cada pessoa ativa a conta pelo link, entra e NAO alcanca o outro cliente.

const suffix = tag();
const nameA = `Cliente A ${suffix}`;
const nameB = `Cliente B ${suffix}`;
const emailA = `dono-a-${suffix}@ficticio.test`;
const emailB = `dono-b-${suffix}@ficticio.test`;
const userPassword = "uma-senha-e2e-bem-longa-1"; // so de teste

const state: { idA?: string; idB?: string; linkA?: string; linkB?: string } = {};

async function createClient(page: Page, name: string): Promise<string> {
  await page.goto("/admin/clients");
  await page.getByRole("button", { name: "Novo cliente" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Novo cliente" });
  await dialog.getByLabel("Nome do cliente").fill(name);
  await dialog.getByLabel("Nome do contato (opcional)").fill("Contato Ficticio");
  await dialog.getByLabel("E-mail do contato (opcional)").fill(`contato-${tag()}@ficticio.test`);
  // Fuso padrao America/Maceio ja vem selecionado.
  await expect(dialog.getByRole("combobox", { name: "Fuso horário" })).toContainText("Maceió");
  await dialog.getByRole("button", { name: "Criar cliente" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  await expect(page.getByText(`Cliente "${name}" criado.`)).toBeVisible();
  return page.url().split("/admin/clients/")[1];
}

async function inviteOwner(page: Page, clientId: string, clientName: string, email: string): Promise<string> {
  await page.goto(`/admin/clients/${clientId}`);
  await expect(page.getByText("Ninguém com acesso ainda")).toBeVisible(); // estado vazio de pessoas
  await page.getByRole("button", { name: "Convidar pessoa" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("E-mail da pessoa").fill(email);
  await dialog.getByRole("button", { name: "Criar convite" }).click();
  await expect(dialog.getByRole("heading", { name: "Convite criado" })).toBeVisible();
  // Estado honesto: sem SMTP, nenhum e-mail foi enviado e o link aparece uma unica vez.
  await expect(dialog.getByText("nenhum e-mail foi enviado")).toBeVisible();
  await expect(dialog.getByText("Este link aparece só agora")).toBeVisible();
  const link = await dialog.getByLabel("Link do convite").inputValue();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{40,}$/);
  await dialog.getByRole("button", { name: "Concluir" }).click();
  await expect(dialog).toBeHidden();
  // O link nao esta mais em lugar nenhum da pagina; so o e-mail e a situacao "Pendente".
  await expect(page.getByRole("cell", { name: email, exact: true })).toBeVisible();
  await expect(page.getByText("Pendente")).toBeVisible();
  expect(await page.content()).not.toContain(link.split("/invite/")[1]);
  return link;
}

async function activate(browser: Browser, link: string, name: string): Promise<Page> {
  const context = await browser.newContext({ locale: "pt-BR", baseURL: test.info().project.use.baseURL });
  const page = await context.newPage();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Ative sua conta" })).toBeVisible();
  await page.getByLabel("Seu nome").fill(name);
  await page.getByLabel("Crie uma senha").fill(userPassword);
  await page.getByLabel("Repita a senha").fill(userPassword);
  await page.getByRole("button", { name: "Ativar conta e entrar" }).click();
  await page.waitForURL("**/portal");
  return page;
}

test.describe.serial("admin cadastra dois clientes, convida e cada pessoa so ve o proprio cliente", () => {
  test("P1: admin entra, cria Cliente A e Cliente B e ve os dois na lista com auditoria", async ({ page }) => {
    await loginViaUi(page, ADMIN_EMAIL, seedPassword());
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1, name: "Painel" })).toBeVisible();

    state.idA = await createClient(page, nameA);
    state.idB = await createClient(page, nameB);

    await page.goto(`/admin/clients?q=${suffix}`);
    await expect(page.getByRole("link", { name: nameA })).toBeVisible();
    await expect(page.getByRole("link", { name: nameB })).toBeVisible();
    await expect(page.getByText("Mostrando 1–2 de 2")).toBeVisible();

    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { level: 1, name: "Auditoria" })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(`Cliente criado.*${nameA}`) })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(`Cliente criado.*${nameB}`) })).toBeVisible();

    // Sessao so em cookie HttpOnly: nada de token em localStorage/sessionStorage nem em document.cookie.
    const storage = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie }));
    expect(storage).not.toMatch(/session|token|better-auth/i);
    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name.includes("session_token"));
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Lax");
  });

  test("P2: admin convida uma pessoa em cada cliente (link mostrado uma unica vez)", async ({ page }) => {
    await loginViaUi(page, ADMIN_EMAIL, seedPassword());
    state.linkA = await inviteOwner(page, state.idA!, nameA, emailA);
    state.linkB = await inviteOwner(page, state.idB!, nameB, emailB);
  });

  test("P2/P3: cada pessoa ativa a conta, entra no portal do seu cliente e nao alcanca o outro", async ({ browser }) => {
    const pageA = await activate(browser, state.linkA!, "Dona do Cliente A");
    const pageB = await activate(browser, state.linkB!, "Dono do Cliente B");

    // Cada uma ve so o proprio cliente.
    await expect(pageA.getByText(nameA).first()).toBeVisible();
    await expect(pageA.getByText(nameB)).toHaveCount(0);
    await expect(pageB.getByText(nameB).first()).toBeVisible();
    await expect(pageB.getByText(nameA)).toHaveCount(0);
    await expect(pageA.getByText(emailB)).toHaveCount(0);

    // Convite usado: segunda abertura falha com a mesma mensagem de qualquer convite invalido.
    const again = await pageA.context().newPage();
    await again.goto(state.linkA!);
    await expect(again.getByRole("heading", { name: "Convite inválido ou expirado" })).toBeVisible();
    await again.close();

    // A tenta /admin e o cliente B por URL.
    for (const path of ["/admin", "/admin/clients", `/admin/clients/${state.idB}`, `/admin/clients/${state.idA}`, "/admin/audit"]) {
      await pageA.goto(path);
      await expect(pageA.getByRole("heading", { level: 1, name: "Acesso negado" }), path).toBeVisible();
      await expect(pageA.getByText(nameB)).toHaveCount(0);
      await expect(pageA.getByText(emailB)).toHaveCount(0);
    }
    // ... e pela API, com o cookie da propria sessao.
    for (const path of ["/api/admin/clients", `/api/admin/clients/${state.idB}`, "/api/admin/audit"]) {
      const r = await pageA.request.get(path);
      expect(r.status(), path).toBe(403);
      expect(await r.text()).not.toContain(nameB);
    }
    // Pedir o cliente B no portal nao muda nada: o servidor usa o cliente da sessao.
    const portal = await pageA.request.get(`/api/portal/client?clientId=${state.idB}`);
    expect(portal.status()).toBe(200);
    expect(await portal.text()).toContain(nameA);
    expect(await portal.text()).not.toContain(nameB);
    // Trocar para o cliente B (onde nao participa) e negado.
    const swap = await pageA.request.post("/api/portal/context", { data: { clientId: state.idB }, headers: { origin: new URL(pageA.url()).origin } });
    expect(swap.status()).toBe(403);

    // Simetrico: B nao alcanca A.
    await pageB.goto(`/admin/clients/${state.idA}`);
    await expect(pageB.getByRole("heading", { level: 1, name: "Acesso negado" })).toBeVisible();
    await expect(pageB.getByText(nameA)).toHaveCount(0);
    expect((await pageB.request.get(`/api/admin/clients/${state.idA}`)).status()).toBe(403);

    await pageA.goto("/portal");
    await logoutViaUi(pageA, "Dona do Cliente A");
    // Depois de sair, o cookie some e a area privada pede login.
    await pageA.goto("/portal");
    await expect(pageA).toHaveURL(/\/login\?next=%2Fportal/);
    await pageA.context().close();
    await pageB.context().close();
  });

  test("login: credenciais erradas mostram erro inline sem dizer qual campo errou", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(emailA);
    await page.getByLabel("Senha", { exact: true }).fill("senha-errada-123456");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
    await page.getByLabel("E-mail").fill("ninguem@nao-existe.test");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
    // Validacao inline em pt-BR antes de enviar.
    await page.getByLabel("E-mail").fill("sem-arroba");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("Informe um e-mail válido, como nome@empresa.com.br.")).toBeVisible();
  });
});
