import "dotenv/config";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Navegadores do Playwright dentro do projeto (ignorado pelo Git), nao em %LOCALAPPDATA%: o Python que roda
// scripts/verificar.py enxerga uma copia virtualizada de AppData\Local e nao acha o Chromium de la
// ("Executable doesn't exist"). Para instalar:  PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers node node_modules/@playwright/test/cli.js install chromium
process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve(__dirname, ".playwright-browsers");

// Jornadas da spec 0001 no navegador. Playwright abre um Chromium ISOLADO (perfil novo em cada contexto),
// nunca o navegador pessoal. O app sobe COMPILADO (next build) contra nexo_test na porta 3101.
const PORT = 3101;

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Maceio",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `node scripts/iniciar-app-teste.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: { AUTH_SIGNIN_RATE_MAX: "1000" },
  },
});
