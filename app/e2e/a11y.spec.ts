import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_PASSWORD, seedVisualData, type VisualData } from "./helpers/db";
import { ADMIN_EMAIL, loginViaUi, seedPassword } from "./helpers/ui";

// Checagem automatizada de acessibilidade (axe-core, WCAG 2.0/2.1/2.2 A e AA, inclui contraste) nas telas
// principais, em 360 e 1440 px, tema claro e escuro. Zero violacoes, de qualquer impacto.

let data: VisualData;
test.beforeAll(async () => {
  data = await seedVisualData();
});

async function audit(page: Page, label: string) {
  await page.evaluate(() => document.fonts.ready);
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const summary = result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
  expect(summary, `${label}: violacoes de acessibilidade`).toEqual([]);
}

const SIZES = [
  { w: 360, h: 780 },
  { w: 1440, h: 900 },
] as const;

async function ctx(browser: Browser, size: { w: number; h: number }, theme: "light" | "dark") {
  return browser.newContext({ viewport: { width: size.w, height: size.h }, colorScheme: theme, locale: "pt-BR", baseURL: test.info().project.use.baseURL });
}

for (const size of SIZES) {
  for (const theme of ["light", "dark"] as const) {
    test(`axe ${size.w}px ${theme}: telas publicas`, async ({ browser }) => {
      const c = await ctx(browser, size, theme);
      const page = await c.newPage();
      for (const [path, heading] of [
        ["/login", "Entrar"],
        ["/invite/token-que-nao-existe-0123456789abcdef", "Convite inválido ou expirado"],
        ["/forgot-password", "Recuperação de senha indisponível"],
        ["/reset-password?error=INVALID_TOKEN", "Link inválido ou expirado"],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
        await audit(page, `${path} ${size.w} ${theme}`);
      }
      // Formulario com erro inline (mensagens e aria-invalid).
      await page.goto("/login");
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(page.getByText("Informe o e-mail.")).toBeVisible();
      await audit(page, `/login com erros ${size.w} ${theme}`);
      await c.close();
    });

    test(`axe ${size.w}px ${theme}: admin`, async ({ browser }) => {
      const c = await ctx(browser, size, theme);
      const page = await c.newPage();
      await loginViaUi(page, ADMIN_EMAIL, seedPassword());
      const routes: [string, string][] = [
        ["/admin", "Painel"],
        [`/admin/clients?q=${encodeURIComponent(data.clientName)}`, "Clientes"],
        ["/admin/clients?q=nenhum-cliente-com-este-nome", "Clientes"],
        [`/admin/clients/${data.clientId}`, data.clientName],
        ["/admin/audit", "Auditoria"],
        ["/admin/profile", "Perfil"],
        ["/admin/clients/00000000-0000-4000-8000-000000000000", "Página não encontrada"],
      ];
      for (const [path, heading] of routes) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
        await audit(page, `${path} ${size.w} ${theme}`);
      }
      // Modais abertos (foco preso, rotulos, contraste).
      await page.goto(`/admin/clients/${data.clientId}`);
      await page.getByRole("button", { name: "Convidar pessoa" }).click();
      await expect(page.getByRole("dialog", { name: "Convidar pessoa" })).toBeVisible();
      await audit(page, `modal convidar ${size.w} ${theme}`);
      await page.keyboard.press("Escape");
      await page.goto("/admin/clients");
      await page.getByRole("button", { name: "Novo cliente" }).first().click();
      await expect(page.getByRole("dialog", { name: "Novo cliente" })).toBeVisible();
      await audit(page, `modal novo cliente ${size.w} ${theme}`);
      await page.keyboard.press("Escape");
      await page.goto(`/admin/clients/${data.clientId}`);
      await page.getByRole("button", { name: `Ações para ${data.owner.name}` }).click();
      await page.getByRole("menuitem", { name: "Bloquear conta" }).click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await audit(page, `confirmacao ${size.w} ${theme}`);
      await c.close();
    });

    test(`axe ${size.w}px ${theme}: portal e acesso negado`, async ({ browser }) => {
      const c = await ctx(browser, size, theme);
      const page = await c.newPage();
      await loginViaUi(page, data.owner.email, E2E_PASSWORD);
      for (const [path, heading] of [
        ["/portal", /Olá, /],
        ["/portal/profile", "Perfil"],
        ["/admin", "Acesso negado"],
      ] as const) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
        await audit(page, `${path} ${size.w} ${theme}`);
      }
      await c.close();
    });
  }
}
