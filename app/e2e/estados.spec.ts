import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, addMemberRow, createClientRow, createUserRow, tag, withDb } from "./helpers/db";
import { ADMIN_EMAIL, expectNoHorizontalScroll, loginViaUi, seedPassword } from "./helpers/ui";

// Estados da interface (vazio, erro, carregando, acesso negado, nao encontrado), confirmacao de acoes
// destrutivas, teclado e troca de contexto para quem participa de mais de um cliente (P4 e P5).

test.describe("estados e acoes do admin", () => {
  test("vazio: busca sem resultado e cliente recem-criado sem pessoas; nao encontrado para id inexistente", async ({ page }) => {
    await loginViaUi(page, ADMIN_EMAIL, seedPassword());
    await page.goto(`/admin/clients?q=nada-corresponde-${tag()}`);
    await expect(page.getByText("Nenhum cliente encontrado")).toBeVisible();
    await page.getByRole("link", { name: "Limpar busca" }).first().click();
    await expect(page).toHaveURL(/\/admin\/clients$/);

    const name = `Cliente Vazio ${tag()}`;
    const id = await createClientRow(name);
    await page.goto(`/admin/clients/${id}`);
    await expect(page.getByText("Ninguém com acesso ainda")).toBeVisible();
    await expect(page.getByText("Nenhum convite criado para este cliente.")).toBeVisible();

    await page.goto("/admin/clients/00000000-0000-4000-8000-000000000000");
    await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
    await page.goto("/admin/clients/nao-e-um-uuid");
    await expect(page.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
  });

  test("erro: falha do servidor ao criar cliente aparece no formulario, sem sucesso falso e sem stack", async ({ page }) => {
    await loginViaUi(page, ADMIN_EMAIL, seedPassword());
    await page.goto("/admin/clients");
    await page.route("**/api/admin/clients", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL", message: "Algo deu errado. Tente novamente em instantes.", requestId: "r" } }) });
    });
    await page.getByRole("button", { name: "Novo cliente" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Novo cliente" });
    await dialog.getByLabel("Nome do cliente").fill(`Cliente Que Nao Sera Criado ${tag()}`);
    await dialog.getByRole("button", { name: "Criar cliente" }).click();
    await expect(dialog.getByRole("alert").filter({ hasText: "Algo deu errado do nosso lado" })).toBeVisible();
    await expect(page.getByText(/criado\./)).toHaveCount(0);
    await expect(dialog).toBeVisible();
    expect(await page.content()).not.toMatch(/node_modules|\bat\s+\S+\s+\(/);
  });

  test("erro de validacao: mensagens em portugues junto do campo, e o servidor tambem valida", async ({ page }) => {
    await loginViaUi(page, ADMIN_EMAIL, seedPassword());
    await page.goto("/admin/clients");
    await page.getByRole("button", { name: "Novo cliente" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Novo cliente" });
    await dialog.getByLabel("Nome do cliente").fill("x");
    await dialog.getByLabel("E-mail do contato (opcional)").fill("nao-e-email");
    await dialog.getByRole("button", { name: "Criar cliente" }).click();
    await expect(dialog.getByText("Informe o nome do cliente (mínimo 2 caracteres).")).toBeVisible();
    await expect(dialog.getByText("Informe um e-mail de contato válido.")).toBeVisible();
    // Teclado: Esc fecha o modal e devolve o foco ao botao que o abriu.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Novo cliente" }).first()).toBeFocused();
  });

  test("carregando: skeleton aparece durante a navegacao lenta", async ({ page }) => {
    await loginViaUi(page, ADMIN_EMAIL, seedPassword());
    // A tela so mostra o esqueleto se o Next ja pre-buscou o casco da rota (Link na viewport). Espera essa
    // pre-busca terminar ANTES de atrasar a rede: sem isso o teste depende de uma corrida.
    const prefetched = page.waitForResponse((r) => {
      const h = r.request().headers();
      return r.url().includes("/admin/audit") && Boolean(h["next-router-prefetch"] || h["next-router-segment-prefetch"]) && r.ok();
    });
    await page.goto("/admin");
    await prefetched;
    // Atrasa so a busca dinamica da tela (RSC, nao a pre-busca do esqueleto), como numa rede lenta.
    await page.route("**/admin/audit*", async (route) => {
      const h = route.request().headers();
      if (h["rsc"] === "1" && !h["next-router-prefetch"]) await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    await page.getByRole("link", { name: "Auditoria" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "Carregando" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Auditoria" })).toBeVisible();
  });

  test("acoes destrutivas pedem confirmacao: cancelar nao muda nada; confirmar bloqueia, derruba a sessao e desbloqueia", async ({ page, browser }) => {
    const client = `Cliente Bloqueio ${tag()}`;
    const clientId = await createClientRow(client);
    const person = await createUserRow({ name: "Pessoa Bloqueavel" });
    await addMemberRow(clientId, person.id, "CLIENT_COLLABORATOR");

    // A pessoa entra e mantem a sessao aberta em outro contexto.
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const personPage = await ctx.newPage();
    await loginViaUi(personPage, person.email, E2E_PASSWORD);
    await expect(personPage.getByText(client).first()).toBeVisible();

    await loginViaUi(page, ADMIN_EMAIL, seedPassword());
    await page.goto(`/admin/clients/${clientId}`);
    const menu = page.getByRole("button", { name: "Ações para Pessoa Bloqueavel" });
    await menu.click();
    await page.getByRole("menuitem", { name: "Bloquear conta" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Bloquear a conta de Pessoa Bloqueavel?" });
    await expect(confirm).toBeVisible();
    // O foco inicial fica em "Cancelar" (acao destrutiva nao e a padrao).
    await expect(confirm.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await confirm.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText("Conta ativa")).toBeVisible();
    await personPage.reload();
    await expect(personPage.getByText(client).first()).toBeVisible();

    await menu.click();
    await page.getByRole("menuitem", { name: "Bloquear conta" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Bloquear conta" }).click();
    await expect(page.getByText("Conta bloqueada e sessões encerradas.")).toBeVisible();
    await expect(page.getByRole("row", { name: /Pessoa Bloqueavel/ }).getByText("Conta bloqueada", { exact: true })).toBeVisible();

    // Requisicao seguinte da pessoa: sessao derrubada, vai para o login.
    await personPage.reload();
    await expect(personPage).toHaveURL(/\/login/);
    // E nao consegue entrar de novo enquanto bloqueada.
    await personPage.getByLabel("E-mail").fill(person.email);
    await personPage.getByLabel("Senha", { exact: true }).fill(E2E_PASSWORD);
    await personPage.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(personPage.getByText(/bloqueada/i)).toBeVisible();
    await expect(personPage).toHaveURL(/\/login/);

    await menu.click();
    await page.getByRole("menuitem", { name: "Desbloquear conta" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Desbloquear conta" }).click();
    await expect(page.getByText("Conta desbloqueada.")).toBeVisible();
    await personPage.getByRole("button", { name: "Entrar", exact: true }).click();
    await personPage.waitForURL("**/portal");

    // Encerrar sessoes tambem confirma antes e derruba a sessao.
    await menu.click();
    await page.getByRole("menuitem", { name: "Encerrar sessões" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Encerrar sessões" }).click();
    // exact: o toast anterior ("Conta bloqueada e sessões encerradas.") ainda pode estar na tela.
    await expect(page.getByText("Sessões encerradas.", { exact: true })).toBeVisible();
    await personPage.reload();
    await expect(personPage).toHaveURL(/\/login/);

    // A auditoria registra as tres acoes (sem senha nem token).
    await page.reload();
    for (const label of ["Conta bloqueada", "Conta desbloqueada", "Sessões encerradas"]) {
      await expect(page.getByRole("listitem").filter({ hasText: label }).first()).toBeVisible();
    }
    await ctx.close();
  });

  test("revogar convite pede confirmacao e o link deixa de funcionar", async ({ page, browser }) => {
    const clientId = await createClientRow(`Cliente Convite ${tag()}`);
    await loginViaUi(page, ADMIN_EMAIL, seedPassword());
    await page.goto(`/admin/clients/${clientId}`);
    await page.getByRole("button", { name: "Convidar pessoa" }).click();
    const dialog = page.getByRole("dialog");
    const email = `revogar-${tag()}@ficticio.test`;
    await dialog.getByLabel("E-mail da pessoa").fill(email);
    await dialog.getByRole("button", { name: "Criar convite" }).click();
    const link = await dialog.getByLabel("Link do convite").inputValue();
    await dialog.getByRole("button", { name: "Concluir" }).click();

    await page.getByRole("button", { name: `Revogar convite de ${email}` }).click();
    const confirm = page.getByRole("alertdialog", { name: "Revogar este convite?" });
    await confirm.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText("Pendente")).toBeVisible();
    await page.getByRole("button", { name: `Revogar convite de ${email}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Revogar convite" }).click();
    await expect(page.getByText("Convite revogado.")).toBeVisible();
    await expect(page.getByText("Revogado", { exact: true })).toBeVisible();

    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await other.goto(link);
    await expect(other.getByRole("heading", { name: "Convite inválido ou expirado" })).toBeVisible();
    await ctx.close();
  });
});

test.describe("acesso negado e teclado", () => {
  test("pessoa de cliente nao entra em /admin: tela de acesso negado sem dados e com saida", async ({ page }) => {
    const clientId = await createClientRow(`Cliente Negado ${tag()}`);
    const person = await createUserRow({ name: "Pessoa Comum" });
    await addMemberRow(clientId, person.id, "CLIENT_OWNER");
    await loginViaUi(page, person.email, E2E_PASSWORD);
    await page.goto("/admin/clients");
    await expect(page.getByRole("heading", { level: 1, name: "Acesso negado" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Voltar ao início" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Administração" })).toHaveCount(0);
    await page.getByRole("link", { name: "Voltar ao início" }).click();
    await expect(page).toHaveURL(/\/portal$/);
  });

  test("login so com teclado: Tab percorre os campos com foco visivel e Enter envia", async ({ page }) => {
    const person = await createUserRow({ name: "Pessoa Teclado" });
    const clientId = await createClientRow(`Cliente Teclado ${tag()}`);
    await addMemberRow(clientId, person.id, "CLIENT_COLLABORATOR");
    await page.goto("/login");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("E-mail")).toBeFocused();
    // Foco visivel: contorno aplicado.
    const outline = await page.getByLabel("E-mail").evaluate((el) => getComputedStyle(el).boxShadow + getComputedStyle(el).outlineStyle);
    expect(outline).not.toMatch(/^none ?none$/);
    await page.keyboard.type(person.email);
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Senha", { exact: true })).toBeFocused();
    await page.keyboard.type(E2E_PASSWORD);
    await page.keyboard.press("Enter");
    await page.waitForURL("**/portal");
    await expect(page.getByRole("heading", { level: 1, name: /Olá, Pessoa/ })).toBeVisible();
    // Link "Ir para o conteudo" e o primeiro foco da pagina.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Ir para o conteúdo" })).toBeFocused();
  });

  test("menu movel (360px) abre como gaveta, fecha com Esc e nao cria rolagem horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await loginViaUi(page, ADMIN_EMAIL, seedPassword());
    await expect(page.getByRole("navigation", { name: "Administração" })).toHaveCount(0); // sidebar fixa so no desktop
    await page.getByRole("button", { name: "Abrir menu de navegação" }).click();
    const nav = page.getByRole("dialog", { name: "Menu de navegação" });
    await expect(nav.getByRole("link", { name: "Clientes" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(nav).toBeHidden();
    await page.goto("/admin/clients");
    await expectNoHorizontalScroll(page);
    await page.getByRole("button", { name: "Abrir menu de navegação" }).click();
    await page.getByRole("dialog", { name: "Menu de navegação" }).getByRole("link", { name: "Auditoria" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Auditoria" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});

test.describe("quem participa de mais de um cliente (P5)", () => {
  test("escolhe o contexto, troca pelo topo e o dado do cliente anterior some", async ({ page }) => {
    const nameA = `Cliente Alfa ${tag()}`;
    const nameB = `Cliente Beta ${tag()}`;
    const a = await createClientRow(nameA);
    const b = await createClientRow(nameB);
    const person = await createUserRow({ name: "Pessoa Dois Clientes" });
    await addMemberRow(a, person.id, "CLIENT_OWNER");
    await addMemberRow(b, person.id, "CLIENT_COLLABORATOR");
    // Gente de cada cliente para provar que os dados do outro nao aparecem.
    const colleagueA = await createUserRow({ name: "Colega So Do Alfa" });
    await addMemberRow(a, colleagueA.id, "CLIENT_COLLABORATOR");

    await loginViaUi(page, person.email, E2E_PASSWORD);
    await expect(page.getByRole("heading", { name: "Escolha o cliente" })).toBeVisible();
    await page.getByRole("button", { name: new RegExp(nameA) }).click();
    await expect(page.getByRole("heading", { level: 1, name: /Olá, Pessoa/ })).toBeVisible();
    await expect(page.getByText("Colega So Do Alfa")).toBeVisible();
    await expect(page.getByText(`Você está em ${nameA}`)).toBeVisible();

    // Troca pelo seletor do topo: o nome e a equipe do Alfa somem; o Beta aparece.
    await page.getByRole("combobox", { name: "Cliente ativo" }).click();
    await page.getByRole("option", { name: nameB }).click();
    await expect(page.getByText("Cliente alterado.")).toBeVisible();
    await expect(page.getByText(`Você está em ${nameB}`)).toBeVisible();
    await expect(page.getByText("Colega So Do Alfa")).toHaveCount(0);
    await expect(page.getByText(nameA)).toHaveCount(0);

    // O contexto fica gravado na sessao (servidor): recarregar mantem o Beta, e voltar ao Alfa tambem funciona.
    await page.reload();
    await expect(page.getByText(`Você está em ${nameB}`)).toBeVisible();
    await page.getByRole("combobox", { name: "Cliente ativo" }).click();
    await page.getByRole("option", { name: nameA }).click();
    await expect(page.getByText("Colega So Do Alfa")).toBeVisible();
    await expect(page.getByText(nameB)).toHaveCount(0);

    // Membro revogado em um cliente: some da lista de escolha na requisicao seguinte.
    await withDb((c) => c.query("UPDATE client_members SET status = 'REVOKED' WHERE client_id = $1 AND user_id = $2", [b, person.id]));
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Cliente ativo" })).toHaveCount(0);
    await expect(page.getByText(nameB)).toHaveCount(0);
  });
});

test.describe("perfil, tema e senha (P4)", () => {
  test("tema escolhido fica salvo na conta e volta apos sair e entrar; troca de senha encerra a sessao antiga", async ({ page, browser }) => {
    const clientId = await createClientRow(`Cliente Perfil ${tag()}`);
    const person = await createUserRow({ name: "Pessoa Perfil" });
    await addMemberRow(clientId, person.id, "CLIENT_OWNER");
    await loginViaUi(page, person.email, E2E_PASSWORD);
    await page.goto("/portal/profile");
    await expect(page.getByRole("heading", { level: 1, name: "Perfil" })).toBeVisible();

    await page.getByRole("radio", { name: /Escuro/ }).check();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect.poll(() => withDb(async (c) => (await c.query("SELECT theme_preference FROM users WHERE id = $1", [person.id])).rows[0].theme_preference)).toBe("DARK");

    // Outro aparelho (contexto novo, sem localStorage): o tema vem da conta.
    const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const other = await ctx.newPage();
    await loginViaUi(other, person.email, E2E_PASSWORD);
    await expect(other.locator("html")).toHaveClass(/dark/);

    // Troca de senha: erro na senha atual errada; sucesso encerra a outra sessao.
    const newPassword = "nova-senha-e2e-bem-longa-9";
    await page.getByLabel("Senha atual", { exact: true }).fill("senha-atual-errada-12345");
    await page.getByLabel("Nova senha", { exact: true }).fill(newPassword);
    await page.getByLabel("Repita a nova senha").fill(newPassword);
    await page.getByRole("button", { name: "Alterar senha" }).click();
    await expect(page.getByText("A senha atual está incorreta.")).toBeVisible();
    await page.getByLabel("Senha atual", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Alterar senha" }).click();
    await expect(page.getByText("Senha alterada. Suas outras sessões foram encerradas.")).toBeVisible();
    await other.reload();
    await expect(other).toHaveURL(/\/login/);
    await ctx.close();
  });

  test("recuperacao de senha sem e-mail configurado mostra estado indisponivel (sem sucesso falso)", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { level: 1, name: "Recuperação de senha indisponível" })).toBeVisible();
    await expect(page.getByText(/não está configurado/)).toBeVisible();
    await expect(page.getByLabel("E-mail da conta")).toHaveCount(0);
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { level: 1, name: "Redefinição de senha indisponível" })).toBeVisible();
    await page.goto("/reset-password?error=INVALID_TOKEN");
    await expect(page.getByRole("heading", { level: 1, name: "Link inválido ou expirado" })).toBeVisible();
  });
});
