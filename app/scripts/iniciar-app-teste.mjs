// Sobe o app JA COMPILADO (next build) contra o banco nexo_test, para testes HTTP e E2E.
// Uso: node scripts/iniciar-app-teste.mjs [porta]
// Recusa qualquer banco que nao seja nexo_test em 127.0.0.1/localhost. Nunca imprime segredos.
import "dotenv/config";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const porta = process.argv[2] ?? "3100";
if (!/^\d{4,5}$/.test(porta)) {
  console.error("Porta invalida.");
  process.exit(2);
}
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error("Defina TEST_DATABASE_URL em app/.env.");
  process.exit(2);
}
const u = new URL(url);
if (!["127.0.0.1", "localhost"].includes(u.hostname) || u.pathname !== "/nexo_test") {
  console.error("Recusado: o app de teste so roda contra nexo_test em 127.0.0.1/localhost.");
  process.exit(2);
}

// O Vitest define TEST/VITEST no ambiente e o Better Auth desliga a checagem de origem (CSRF) quando TEST esta
// ligado. O app de teste precisa se comportar como producao: essas variaveis nao passam para ele.
const ambiente = { ...process.env };
for (const nome of Object.keys(ambiente)) {
  if (nome === "TEST" || nome === "CI_TEST" || nome.startsWith("VITEST")) delete ambiente[nome];
}

const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const filho = spawn(process.execPath, [next, "start", "-p", porta, "-H", "127.0.0.1"], {
  stdio: "inherit",
  env: {
    ...ambiente,
    NODE_ENV: "production",
    DATABASE_URL: url,
    APP_URL: `http://127.0.0.1:${porta}`,
    // Os testes enviam x-real-ip proprio (o proxy real o sobrescreve) para isolar o limite por teste.
    // NEXO_TEST_* permite subir variantes (sem proxy confiavel, com TRUSTED_PROXIES e outro cabecalho).
    TRUST_PROXY: process.env.NEXO_TEST_TRUST_PROXY ?? "true",
    TRUSTED_IP_HEADER: process.env.NEXO_TEST_IP_HEADER ?? "x-real-ip",
    TRUSTED_PROXIES: process.env.NEXO_TEST_TRUSTED_PROXIES ?? "",
    AUTH_SIGNIN_RATE_MAX: process.env.AUTH_SIGNIN_RATE_MAX ?? "5",
    AUTH_SIGNIN_EMAIL_MAX: process.env.AUTH_SIGNIN_EMAIL_MAX ?? "10",
    AUTH_SIGNIN_EMAIL_GLOBAL_MAX: process.env.AUTH_SIGNIN_EMAIL_GLOBAL_MAX ?? "100",
  },
});
const encerrar = () => filho.kill();
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
filho.on("exit", (code) => process.exit(code ?? 0));
