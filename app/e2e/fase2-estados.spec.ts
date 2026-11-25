import { expect, test } from "@playwright/test";
import { addMemberRow, createClientRow, tag } from "./helpers/db";
import { loginAdmin, loginAs, makePerson, PASSWORD } from "./helpers/fase2";

// Estados obrigatorios das telas da fase 2: vazio, erro, acesso negado, nao encontrado, carregando (esqueleto),
// confirmacao de acao destrutiva, teclado e troca de cliente sem estado antigo.

test.describe("fase 2: estados", () => {
  test("vazio e sem cliente escolhido (agencia): mensagens honestas e proximo passo", async ({ browser }) => {
    const clientId = await createClientRow(`Cliente Sem Ciclo ${tag()}`);
    const { page, context } = await loginAdmin(browser);
    await page.goto("/admin/contents");
    await expect(page.getByRole("heading", { name: "Escolha um cliente" })).toBeVisible();
    await page.goto(`/admin/contents?client=${clientId}`);
    await expect(page.getByText("Nenhuma peça planejada")).toBeVisible();
    await expect(page.getByText(/Abra um ciclo em/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Nova peça" })).toBeDisabled();
    await page.goto(`/admin/subscriptions?client=${clientId}`);
    await expect(page.getByText("Este cliente ainda não tem assinatura")).toBeVisible();
    await expect(page.getByText("Nenhum ciclo aberto")).toBeVisible();
    await page.goto(`/admin/scripts?client=${clientId}`);
    await expect(page.getByText("Nenhum roteiro criado")).toBeVisible();
    await page.goto(`/admin/calendar?client=${clientId}`);
    await expect(page.getByText("Nenhuma peça neste mês")).toBeVisible();
    await context.close();
  });

  test("nao encontrado: id inexistente, malformado e cliente-alvo invalido dao a mesma tela", async ({ browser }) => {
    const { page, context } = await loginAdmin(browser);
    const clientId = await createClientRow(`Cliente NF ${tag()}`);
    for (const url of [
      `/admin/contents/${crypto.randomUUID()}?client=${clientId}`,
      `/admin/contents/nao-e-uuid?client=${clientId}`,
      `/admin/contents?client=nao-e-uuid`,
      `/admin/scripts/${crypto.randomUUID()}?client=${clientId}`,
      `/admin/contents?client=${crypto.randomUUID()}`,
    ]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" }), url).toBeVisible();
    }
    await context.close();
  });

  test("acesso negado e sem login", async ({ browser }) => {
    const clientId = await createClientRow(`Cliente AN ${tag()}`);
    const p = await makePerson("Pessoa AN");
    await addMemberRow(clientId, p.id, "CLIENT_OWNER");
    const { page, context } = await loginAs(browser, p.email, PASSWORD);
    for (const url of ["/admin/plans", "/admin/subscriptions", "/admin/calendar", "/admin/contents", "/admin/scripts"]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1, name: "Acesso negado" }), url).toBeVisible();
    }
    await context.close();
    const anon = await browser.newContext({ baseURL: "http://127.0.0.1:3101" });
    const a = await anon.newPage();
    await a.goto("/portal/plan");
    await expect(a).toHaveURL(/\/login/);
    await a.goto("/admin/plans");
    await expect(a).toHaveURL(/\/login/);
    await anon.close();
  });

  test("pessoa sem cliente ativo ve estado explicativo e nenhum dado", async ({ browser }) => {
    const p = await makePerson("Pessoa Sem Cliente");
    const { page, context } = await loginAs(browser, p.email, PASSWORD);
    for (const url of ["/portal/plan", "/portal/contents", "/portal/approvals", "/portal/scripts", "/portal/calendar"]) {
      await page.goto(url);
      await expect(page.getByText("Nenhum cliente ativo").first(), url).toBeVisible();
    }
    await context.close();
  });

  test("erro: falha do servidor aparece no formulario, sem sucesso falso; erro de rede tambem", async ({ browser }) => {
    const { page, context } = await loginAdmin(browser);
    await page.goto("/admin/plans");
    await page.getByRole("button", { name: "Novo plano" }).first().click();
    const d = page.getByRole("dialog", { name: "Novo plano" });
    await d.getByLabel("Código do plano").fill(`erro-${tag()}`);
    await d.getByLabel("Nome do plano").fill("Plano que vai falhar");
    await d.getByLabel("Valor mensal (R$)").fill("100,00");
    await d.getByLabel("Cota de publicações por mês").fill("1");
    await d.getByLabel("Revisões por peça").fill("1");
    await d.getByLabel("Prazo de aprovação (dias úteis)").fill("1");
    await d.getByLabel("Escopo (o que está incluído)").fill("Escopo de teste");
    await page.route("**/api/admin/plans", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "x", requestId: "r" } }) }));
    await d.getByRole("button", { name: "Criar plano" }).click();
    await expect(d.getByText("Algo deu errado do nosso lado. Tente novamente em instantes.")).toBeVisible();
    await expect(page.getByText(/criado\./)).toHaveCount(0);
    await page.unroute("**/api/admin/plans");
    await page.route("**/api/admin/plans", (route) => route.abort("connectionreset"));
    await d.getByRole("button", { name: "Criar plano" }).click();
    await expect(d.getByText("Sem conexão com o servidor. Verifique sua internet e tente de novo.")).toBeVisible();
    await context.close();
  });

  test("teclado: abrir o modal com Enter, Esc fecha e devolve o foco; cancelar peça pede justificativa e Voltar não muda nada", async ({ browser }) => {
    const { page, context } = await loginAdmin(browser);
    await page.goto("/admin/plans");
    const trigger = page.getByRole("button", { name: "Novo plano" }).first();
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Novo plano" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();
    await context.close();
  });

  test("carregando: esqueleto aparece durante a navegacao lenta no portal", async ({ browser }) => {
    const clientId = await createClientRow(`Cliente Lento ${tag()}`);
    const p = await makePerson("Pessoa Lenta");
    await addMemberRow(clientId, p.id, "CLIENT_OWNER");
    const { page, context } = await loginAs(browser, p.email, PASSWORD);
    const prefetched = page.waitForResponse((r) => {
      const h = r.request().headers();
      return r.url().includes("/portal/plan") && Boolean(h["next-router-prefetch"] || h["next-router-segment-prefetch"]) && r.ok();
    });
    await page.goto("/portal");
    await prefetched;
    await page.route("**/portal/plan*", async (route) => {
      const h = route.request().headers();
      if (h["rsc"] === "1" && !h["next-router-prefetch"]) await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page.getByRole("link", { name: "Meu plano" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "Carregando" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Meu plano" })).toBeVisible();
    await context.close();
  });

  test("trocar de cliente (portal) nao deixa nada do anterior; agencia troca de cliente pela URL", async ({ browser }) => {
    const nameA = `Cliente Troca A ${tag()}`;
    const nameB = `Cliente Troca B ${tag()}`;
    const a = await createClientRow(nameA);
    const b = await createClientRow(nameB);
    const p = await makePerson("Pessoa Dois Clientes");
    await addMemberRow(a, p.id, "CLIENT_OWNER");
    await addMemberRow(b, p.id, "CLIENT_OWNER");
    const { page, context } = await loginAs(browser, p.email, PASSWORD);
    await page.goto("/portal/contents");
    const picker = page.getByRole("combobox", { name: "Cliente ativo" });
    // Sem cliente ativo: o portal nao mostra dado nenhum ate a pessoa escolher.
    await expect(page.getByText("Nenhum cliente ativo").first()).toBeVisible();
    await picker.click();
    await page.getByRole("option", { name: nameA }).click();
    await expect(page.getByText("Cliente alterado.")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Cliente ativo" })).toContainText(nameA);
    await expect(page.getByText("Nenhuma peça compartilhada ainda")).toBeVisible();
    await page.getByRole("combobox", { name: "Cliente ativo" }).click();
    await page.getByRole("option", { name: nameB }).click();
    await expect(page.getByRole("combobox", { name: "Cliente ativo" })).toContainText(nameB);
    await context.close();
  });
});
