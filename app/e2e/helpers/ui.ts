import { expect, type Page } from "@playwright/test";

export const ADMIN_EMAIL = "admin@nexo-demo.test"; // usuario ficticio do seed
export const seedPassword = (): string => {
  const p = process.env.SEED_PASSWORD;
  if (!p) throw new Error("SEED_PASSWORD ausente em app/.env");
  return p;
};

/** Entra pela tela de login, como a pessoa faz (formulario real, teclado e botao). */
export async function loginViaUi(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export async function logoutViaUi(page: Page, name: string) {
  await page.getByRole("button", { name: `Menu da conta de ${name}` }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Sem rolagem horizontal da pagina (itens roláveis, como tabelas, ficam dentro do proprio container). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "a pagina rolou na horizontal").toBeLessThanOrEqual(0);
}
