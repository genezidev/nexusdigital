import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { addMemberRow, createClientRow, createUserRow, E2E_PASSWORD, tag } from "./helpers/db";
import { apiCall, loginAs, newPage } from "./helpers/fase2";

// D-0026 / R-24 pela interface real: o dono convida um colaborador, a pessoa aceita o convite e entra, nao ve "Equipe",
// e o dono ajusta a permissao de aprovar e desativa/reativa. O colaborador nunca alcanca a tela nem a API.

const suffix = tag();
const clientName = `Padaria Equipe ${suffix}`;
const collabEmail = `colab-equipe-${suffix}@ficticio.test`;
const collabPassword = "uma-senha-ficticia-forte-1";
const open: BrowserContext[] = [];

let owner: Page;
let ownerEmail: string;
let ownerName: string;
let inviteLink = "";

test.beforeAll(async ({ browser }) => {
  const clientId = await createClientRow(clientName);
  ownerName = `Marina Dona ${suffix}`;
  const o = await createUserRow({ name: ownerName });
  ownerEmail = o.email;
  await addMemberRow(clientId, o.id, "CLIENT_OWNER");
  const session = await loginAs(browser, ownerEmail, E2E_PASSWORD);
  open.push(session.context);
  owner = session.page;
});
test.afterAll(async () => {
  for (const c of open) await c.close();
});

async function axe(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`), label).toEqual([]);
}

async function activate(browser: Browser, link: string): Promise<Page> {
  const r = await newPage(browser);
  open.push(r.context);
  await r.page.goto(link);
  await expect(r.page.getByRole("heading", { name: "Ative sua conta" })).toBeVisible();
  await r.page.getByLabel("Seu nome").fill("Carla Colaboradora");
  await r.page.getByLabel("Crie uma senha").fill(collabPassword);
  await r.page.getByLabel("Repita a senha").fill(collabPassword);
  await r.page.getByRole("button", { name: "Ativar conta e entrar" }).click();
  await r.page.waitForURL("**/portal");
  return r.page;
}

test.describe.serial("o dono convida a equipe", () => {
  test("o dono ve o menu Equipe e a tela com ele mesmo; estados e acessibilidade", async () => {
    await owner.goto("/portal");
    await expect(owner.getByRole("link", { name: "Equipe" }).first()).toBeVisible();
    await owner.getByRole("link", { name: "Equipe" }).first().click();
    await expect(owner.getByRole("heading", { level: 1, name: "Equipe" })).toBeVisible();
    await expect(owner.getByTestId("team-member")).toHaveCount(1);
    await expect(owner.getByText("(você)")).toBeVisible();
    await expect(owner.getByText("Nenhum convite pendente.")).toBeVisible();
    await axe(owner, "/portal/team vazio");
  });

  test("convida por e-mail com permissao padrao (ver e comentar): o link aparece uma vez e some ao fechar", async () => {
    await owner.getByRole("button", { name: "Convidar colaborador" }).click();
    const dialog = owner.getByRole("dialog");
    await expect(dialog.getByLabel("Pode aprovar conteúdos")).not.toBeChecked();
    // e-mail invalido: erro junto do campo
    await dialog.getByLabel("E-mail da pessoa").fill("nao-e-email");
    await dialog.getByRole("button", { name: "Criar convite" }).click();
    await expect(dialog.getByText("Informe um e-mail válido")).toBeVisible();
    await dialog.getByLabel("E-mail da pessoa").fill(collabEmail);
    await dialog.getByRole("button", { name: "Criar convite" }).click();
    await expect(dialog.getByRole("heading", { name: "Convite criado" })).toBeVisible();
    await expect(dialog.getByText("nenhum e-mail foi enviado")).toBeVisible();
    await expect(dialog.getByText("Este link aparece só agora")).toBeVisible();
    inviteLink = await dialog.getByLabel("Link do convite").inputValue();
    expect(inviteLink).toMatch(/\/invite\/[A-Za-z0-9_-]{40,}$/);
    await dialog.getByRole("button", { name: "Concluir" }).click();
    await expect(owner.getByTestId("team-invitation")).toHaveCount(1);
    await expect(owner.getByRole("cell", { name: collabEmail, exact: true })).toBeVisible();
    await expect(owner.getByText("Ver e comentar")).toBeVisible();
    expect(await owner.content()).not.toContain(inviteLink.split("/invite/")[1]);
  });

  test("e-mail que ja tem conta mostra a mensagem clara de 409", async () => {
    await owner.getByRole("button", { name: "Convidar colaborador" }).click();
    const dialog = owner.getByRole("dialog", { name: "Convidar colaborador" });
    await dialog.getByLabel("E-mail da pessoa").fill(ownerEmail);
    await dialog.getByRole("button", { name: "Criar convite" }).click();
    await expect(dialog.getByText(/Já existe uma conta com este e-mail/i)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
  });

  test("a pessoa aceita o convite, entra como colaborador e NAO ve Equipe (nem pela URL nem pela API)", async ({ browser }) => {
    const collab = await activate(browser, inviteLink);
    await expect(collab.getByText(clientName).first()).toBeVisible();
    await expect(collab.getByRole("link", { name: "Equipe" })).toHaveCount(0);
    await collab.goto("/portal/team");
    await expect(collab.getByRole("heading", { level: 1, name: "Acesso negado" })).toBeVisible();
    await expect(collab.getByText(ownerEmail)).toHaveCount(0);
    expect((await apiCall(collab, "GET", "/api/portal/team")).status).toBe(403);
    expect((await apiCall(collab, "POST", "/api/portal/team/invitations", { email: `x-${suffix}@ficticio.test` })).status).toBe(403);
    // o link nao serve duas vezes
    const again = await newPage(browser);
    open.push(again.context);
    await again.page.goto(inviteLink);
    await expect(again.page.getByRole("heading", { name: "Convite inválido ou expirado" })).toBeVisible();
  });

  test("o dono ve a pessoa ativa, liga e desliga a permissao de aprovar, desativa e reativa", async ({ browser }) => {
    await owner.goto("/portal/team");
    const row = owner.getByTestId("team-member").filter({ hasText: collabEmail });
    await expect(row).toBeVisible();
    await expect(row.getByText("Ativo")).toBeVisible();
    await expect(owner.getByText("Nenhum convite pendente.")).toBeVisible();

    const approve = row.getByLabel(/Pode aprovar/);
    await approve.click();
    await expect(owner.getByText("agora pode aprovar conteúdos")).toBeVisible();
    await expect(approve).toBeChecked();
    await owner.reload();
    await expect(owner.getByTestId("team-member").filter({ hasText: collabEmail }).getByLabel(/Pode aprovar/)).toBeChecked();
    await owner.getByTestId("team-member").filter({ hasText: collabEmail }).getByLabel(/Pode aprovar/).click();
    await expect(owner.getByText("não aprova mais conteúdos")).toBeVisible();
    await expect(owner.getByTestId("team-member").filter({ hasText: collabEmail }).getByLabel(/Pode aprovar/)).not.toBeChecked();

    // desativar: confirmacao, acesso cai
    await owner.getByRole("button", { name: "Desativar Carla Colaboradora" }).click();
    const confirm = owner.getByRole("alertdialog", { name: /Desativar Carla Colaboradora/ });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Desativar acesso" }).click();
    const after = owner.getByTestId("team-member").filter({ hasText: collabEmail });
    await expect(after.getByText("Desativado")).toBeVisible();
    const collab = await newPage(browser);
    open.push(collab.context);
    await collab.page.goto("/login");
    await collab.page.getByLabel("E-mail").fill(collabEmail);
    await collab.page.getByLabel("Senha", { exact: true }).fill(collabPassword);
    await collab.page.getByRole("button", { name: "Entrar", exact: true }).click();
    await collab.page.waitForURL((u) => !u.pathname.startsWith("/login"));
    await collab.page.goto("/portal/plan");
    await expect(collab.page.getByText(clientName)).toHaveCount(0);

    // reativar
    await owner.getByRole("button", { name: "Reativar Carla Colaboradora" }).click();
    await expect(owner.getByTestId("team-member").filter({ hasText: collabEmail }).getByText("Ativo")).toBeVisible();
    await collab.page.goto("/portal");
    await expect(collab.page.getByText(clientName).first()).toBeVisible();
    await axe(owner, "/portal/team com colaborador");
  });

  test("a tela cabe em 360 px sem rolar a pagina na horizontal", async ({ browser }) => {
    const r = await newPage(browser, { width: 360, height: 780 });
    open.push(r.context);
    await r.page.goto("/login");
    await r.page.getByLabel("E-mail").fill(ownerEmail);
    await r.page.getByLabel("Senha", { exact: true }).fill(E2E_PASSWORD);
    await r.page.getByRole("button", { name: "Entrar", exact: true }).click();
    await r.page.waitForURL((u) => !u.pathname.startsWith("/login"));
    await r.page.goto("/portal/team");
    await expect(r.page.getByRole("heading", { level: 1, name: "Equipe" })).toBeVisible();
    const overflow = await r.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await axe(r.page, "/portal/team 360px");
  });
});
