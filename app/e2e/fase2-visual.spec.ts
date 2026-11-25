import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { loginAdmin, loginAs, newPage, PASSWORD, seedRich, type Rich } from "./helpers/fase2";
import { expectNoHorizontalScroll } from "./helpers/ui";

// Capturas (360, 768 e 1440 px; claro e escuro) e axe-core (WCAG 2.0/2.1/2.2 A e AA, sem violacoes) das telas da
// fase 2, com dados FICTICIOS montados pelas rotas reais. As imagens vao para specs/0002/evidencias/.

const OUT = path.resolve(__dirname, "../../specs/0002/evidencias");
const SIZES = [
  { w: 360, h: 780 },
  { w: 768, h: 1024 },
  { w: 1440, h: 900 },
] as const;
const THEMES = ["light", "dark"] as const;

let rich: Rich;
test.beforeAll(async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  rich = await seedRich(browser, "Visual");
});

async function audit(page: Page, label: string) {
  await page.evaluate(() => document.fonts.ready);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const summary = result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
  expect(summary, `${label}: violacoes de acessibilidade`).toEqual([]);
}

async function shot(page: Page, name: string, w: number, theme: string, full = true) {
  await page.evaluate(() => document.fonts.ready);
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: path.join(OUT, `${name}_${w}_${theme}.png`), fullPage: full, animations: "disabled" });
}

async function visit(page: Page, url: string, name: string, size: number, theme: string, heading?: string | RegExp) {
  await page.goto(url);
  if (heading) await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  else await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await audit(page, `${name} ${size} ${theme}`);
  await shot(page, name, size, theme);
}

for (const size of SIZES) {
  for (const theme of THEMES) {
    test(`fase 2 ${size.w}px ${theme}: telas da agencia (axe e captura)`, async ({ browser }) => {
      test.setTimeout(240_000);
      const { context, page } = await loginAdmin(browser, { width: size.w, height: size.h, dark: theme === "dark" });
      const q = `client=${rich.clientId}`;
      await visit(page, "/admin/plans", "admin-planos", size.w, theme, "Planos");
      await page.getByRole("button", { name: "Novo plano" }).first().click();
      await expect(page.getByRole("dialog", { name: "Novo plano" })).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "Criar plano" }).click();
      await expect(page.getByText("Informe o nome.")).toBeVisible();
      await audit(page, `admin-plano-modal ${size.w} ${theme}`);
      await shot(page, "admin-plano-modal-erros", size.w, theme, false);
      await page.keyboard.press("Escape");
      await visit(page, "/admin/contents", "admin-conteudos-escolher-cliente", size.w, theme, "Conteúdos");
      await visit(page, `/admin/subscriptions?${q}`, "admin-assinaturas-ciclos", size.w, theme, "Assinaturas e ciclos");
      await visit(page, `/admin/contents?${q}`, "admin-conteudos-lista", size.w, theme, "Conteúdos");
      await visit(page, `/admin/contents?${q}&status=PUBLICADO&q=nada-assim`, "admin-conteudos-vazio", size.w, theme, "Conteúdos");
      await visit(page, `/admin/contents/${rich.contents.awaiting}?${q}`, "admin-conteudo-detalhe", size.w, theme);
      await visit(page, `/admin/contents/${rich.contents.production}?${q}`, "admin-conteudo-producao", size.w, theme);
      await page.getByRole("button", { name: "Cancelar peça" }).click();
      await expect(page.getByRole("dialog", { name: "Cancelar esta peça?" })).toBeVisible();
      await audit(page, `admin-cancelar-modal ${size.w} ${theme}`);
      await shot(page, "admin-cancelar-peca-modal", size.w, theme, false);
      await page.keyboard.press("Escape");
      await visit(page, `/admin/contents/${rich.contents.published}?${q}`, "admin-conteudo-publicado", size.w, theme);
      await visit(page, `/admin/calendar?${q}`, "admin-calendario-mes", size.w, theme, "Calendário");
      await visit(page, `/admin/calendar?${q}&view=list`, "admin-calendario-lista", size.w, theme, "Calendário");
      await visit(page, `/admin/scripts?${q}`, "admin-roteiros-lista", size.w, theme, "Roteiros");
      await visit(page, `/admin/scripts/${rich.scriptId}?${q}`, "admin-roteiro-detalhe", size.w, theme);
      await visit(page, `/admin/contents/${crypto.randomUUID()}?${q}`, "admin-conteudo-nao-encontrado", size.w, theme, "Página não encontrada");
      await context.close();
    });

    test(`fase 2 ${size.w}px ${theme}: telas do portal (axe e captura)`, async ({ browser }) => {
      test.setTimeout(240_000);
      const { context, page } = await loginAs(browser, rich.owner.email, PASSWORD, { width: size.w, height: size.h, dark: theme === "dark" });
      await visit(page, "/portal", "portal-inicio-acoes", size.w, theme);
      await expect(page.getByText("Ações necessárias")).toBeVisible();
      await visit(page, "/portal/plan", "portal-plano", size.w, theme, "Meu plano");
      await visit(page, "/portal/calendar", "portal-calendario-mes", size.w, theme, "Calendário");
      await visit(page, "/portal/calendar?view=list", "portal-calendario-lista", size.w, theme, "Calendário");
      await visit(page, "/portal/contents", "portal-conteudos", size.w, theme, "Conteúdos");
      await visit(page, "/portal/approvals", "portal-aprovacoes", size.w, theme, "Aprovações");
      await visit(page, `/portal/contents/${rich.contents.awaiting}`, "portal-conteudo-decisao", size.w, theme);
      await page.getByRole("button", { name: /Pedir revisão/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Enviar pedido de revisão" }).click();
      await expect(page.getByText("Escreva o comentário.")).toBeVisible();
      await audit(page, `portal-revisao-modal ${size.w} ${theme}`);
      await shot(page, "portal-pedir-revisao-erro", size.w, theme, false);
      await page.keyboard.press("Escape");
      await visit(page, `/portal/contents/${rich.contents.approved}`, "portal-conteudo-aprovado", size.w, theme);
      await visit(page, `/portal/contents/${rich.contents.published}`, "portal-conteudo-publicado", size.w, theme);
      await visit(page, "/portal/scripts", "portal-roteiros", size.w, theme, "Roteiros");
      await visit(page, `/portal/scripts/${rich.scriptId}`, "portal-roteiro-gravacao", size.w, theme);
      await visit(page, `/portal/contents/${crypto.randomUUID()}`, "portal-nao-encontrado", size.w, theme, "Página não encontrada");
      await visit(page, "/admin/plans", "portal-acesso-negado-admin", size.w, theme, "Acesso negado");
      await context.close();
    });
  }
}

test("fase 2: estado vazio do portal (cliente novo, sem plano nem peças) passa no axe", async ({ browser }) => {
  const { createClientRow, addMemberRow } = await import("./helpers/db");
  const { makePerson } = await import("./helpers/fase2");
  const id = await createClientRow(`Cliente Vazio ${Date.now()}`);
  const p = await makePerson("Pessoa do Cliente Vazio");
  await addMemberRow(id, p.id, "CLIENT_OWNER");
  const { context, page } = await loginAs(browser, p.email, PASSWORD, { width: 360, height: 780 });
  for (const [url, text] of [
    ["/portal/plan", "Seu plano ainda não foi cadastrado"],
    ["/portal/contents", "Nenhuma peça compartilhada ainda"],
    ["/portal/approvals", "Nada aguardando a sua aprovação"],
    ["/portal/scripts", "Nenhum roteiro enviado ainda"],
    ["/portal/calendar", "Nenhuma peça neste mês"],
  ] as const) {
    await page.goto(url);
    await expect(page.getByText(text)).toBeVisible();
    await audit(page, `${url} vazio`);
  }
  await shot(page, "portal-vazio", 360, "light");
  await context.close();
  void newPage;
});
