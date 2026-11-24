import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { E2E_PASSWORD, seedVisualData, type VisualData } from "./helpers/db";
import { ADMIN_EMAIL, expectNoHorizontalScroll, loginViaUi, seedPassword } from "./helpers/ui";

// Capturas de tela da spec 0001 em 360, 768 e 1440 px, tema claro e escuro, guardadas em
// specs/0001/evidencias/. Cada captura tambem confere que a pagina nao rola na horizontal.

const OUT = path.resolve(__dirname, "../../specs/0001/evidencias");
const SIZES = [
  { w: 360, h: 780 },
  { w: 768, h: 1024 },
  { w: 1440, h: 900 },
] as const;
const THEMES = ["light", "dark"] as const;

let data: VisualData;

test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  data = await seedVisualData();
});

async function shot(page: Page, name: string, w: number, theme: string) {
  // Espera as fontes e o fim das transicoes para uma captura estavel.
  await page.evaluate(() => document.fonts.ready);
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: path.join(OUT, `${name}_${w}_${theme}.png`), fullPage: true, animations: "disabled" });
}

async function context(browser: Browser, size: { w: number; h: number }, theme: (typeof THEMES)[number]) {
  return browser.newContext({
    viewport: { width: size.w, height: size.h },
    colorScheme: theme,
    locale: "pt-BR",
    timezoneId: "America/Maceio",
    baseURL: test.info().project.use.baseURL,
  });
}

for (const size of SIZES) {
  for (const theme of THEMES) {
    test(`capturas ${size.w}px ${theme}: publicas, admin, portal e estados`, async ({ browser }) => {
      // --- publicas e estados sem login ---
      const anon = await context(browser, size, theme);
      const pub = await anon.newPage();
      await pub.goto("/login");
      await expect(pub.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();
      await shot(pub, "login", size.w, theme);
      await pub.getByLabel("E-mail").fill("sem-arroba");
      await pub.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(pub.getByText("Informe um e-mail válido")).toBeVisible();
      await shot(pub, "login-erro-validacao", size.w, theme);
      await pub.goto("/invite/token-que-nao-existe-0123456789abcdef");
      await expect(pub.getByRole("heading", { name: "Convite inválido ou expirado" })).toBeVisible();
      await shot(pub, "convite-invalido", size.w, theme);
      await pub.goto("/forgot-password");
      await expect(pub.getByRole("heading", { name: "Recuperação de senha indisponível" })).toBeVisible();
      await shot(pub, "recuperar-senha-indisponivel", size.w, theme);
      await anon.close();

      // --- admin ---
      const adminCtx = await context(browser, size, theme);
      const admin = await adminCtx.newPage();
      await loginViaUi(admin, ADMIN_EMAIL, seedPassword());
      await expect(admin.getByRole("heading", { level: 1, name: "Painel" })).toBeVisible();
      await shot(admin, "admin-painel", size.w, theme);
      await admin.goto(`/admin/clients?q=${encodeURIComponent(data.clientName)}`);
      await expect(admin.getByRole("link", { name: data.clientName })).toBeVisible();
      await shot(admin, "admin-clientes", size.w, theme);
      await admin.goto("/admin/clients?q=nenhum-cliente-com-este-nome");
      await expect(admin.getByText("Nenhum cliente encontrado")).toBeVisible();
      await shot(admin, "admin-clientes-vazio", size.w, theme);
      await admin.goto(`/admin/clients/${data.clientId}`);
      await expect(admin.getByRole("heading", { level: 1, name: data.clientName })).toBeVisible();
      await shot(admin, "admin-cliente-detalhe", size.w, theme);
      await admin.getByRole("button", { name: "Convidar pessoa" }).click();
      await expect(admin.getByRole("dialog", { name: "Convidar pessoa" })).toBeVisible();
      await shot(admin, "admin-convidar-modal", size.w, theme);
      await admin.keyboard.press("Escape");
      await admin.getByRole("button", { name: `Ações para ${data.owner.name}` }).click();
      await admin.getByRole("menuitem", { name: "Bloquear conta" }).click();
      await expect(admin.getByRole("alertdialog")).toBeVisible();
      await shot(admin, "admin-confirmar-bloqueio", size.w, theme);
      await admin.getByRole("button", { name: "Cancelar" }).click();
      await admin.goto("/admin/audit");
      await expect(admin.getByRole("heading", { level: 1, name: "Auditoria" })).toBeVisible();
      await shot(admin, "admin-auditoria", size.w, theme);
      await admin.goto("/admin/clients/00000000-0000-4000-8000-000000000000");
      await expect(admin.getByRole("heading", { level: 1, name: "Página não encontrada" })).toBeVisible();
      await shot(admin, "nao-encontrado", size.w, theme);
      await adminCtx.close();

      // --- portal (pessoa do cliente) e acesso negado ---
      const portalCtx = await context(browser, size, theme);
      const portal = await portalCtx.newPage();
      await loginViaUi(portal, data.owner.email, E2E_PASSWORD);
      await expect(portal.getByText(data.clientName).first()).toBeVisible();
      await shot(portal, "portal-inicio", size.w, theme);
      await portal.goto("/portal/profile");
      await expect(portal.getByRole("heading", { level: 1, name: "Perfil" })).toBeVisible();
      await shot(portal, "portal-perfil", size.w, theme);
      await portal.goto("/admin/clients");
      await expect(portal.getByRole("heading", { level: 1, name: "Acesso negado" })).toBeVisible();
      await shot(portal, "acesso-negado", size.w, theme);
      await portalCtx.close();
    });
  }
}
