// Sobe o app JA COMPILADO (next build) contra o banco nexo_test, para testes HTTP e E2E.
// Uso: node scripts/iniciar-app-teste.mjs [porta]
// Recusa qualquer banco que nao seja nexo_test em 127.0.0.1/localhost. Nunca imprime segredos.
import "dotenv/config";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
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

// Armazenamento de TESTE (R-5): pasta fora de app/ e do Git (ver .gitignore) e segredo de assinatura derivado so para o
// teste. Os testes HTTP calculam os mesmos valores (tests/http/helpers/storage.ts). Limites pequenos para provar
// "acima do limite" sem arquivos grandes; cada um pode ser sobrescrito por variavel de ambiente.
const raizApp = fileURLToPath(new URL("..", import.meta.url));
const armazenamento = {
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_DIR: process.env.TEST_STORAGE_LOCAL_DIR ?? path.resolve(raizApp, "..", ".storage-local", "test"),
  STORAGE_SIGNING_SECRET: createHash("sha256").update(`teste-armazenamento:${process.env.BETTER_AUTH_SECRET ?? ""}`).digest("hex"),
  MAX_IMAGE_MB: process.env.MAX_IMAGE_MB ?? "1",
  MAX_PDF_MB: process.env.MAX_PDF_MB ?? "2",
  MAX_VIDEO_MB: process.env.MAX_VIDEO_MB ?? "16",
  UPLOAD_URL_TTL_SECONDS: process.env.UPLOAD_URL_TTL_SECONDS ?? "900",
  DOWNLOAD_URL_TTL_SECONDS: process.env.DOWNLOAD_URL_TTL_SECONDS ?? "60",
  UPLOAD_RATE_MAX: process.env.UPLOAD_RATE_MAX ?? "1000",
  DOWNLOAD_RATE_MAX: process.env.DOWNLOAD_RATE_MAX ?? "1000",
  MAX_PENDING_UPLOADS_PER_USER: process.env.MAX_PENDING_UPLOADS_PER_USER ?? "200",
  // Espaco livre minimo pequeno: o teste nao deve depender do disco da maquina (o padrao real e 2 GB).
  STORAGE_MIN_FREE_MB: process.env.STORAGE_MIN_FREE_MB ?? "64",
  // Limites por pessoa das demais mutacoes (B-5): folgados aqui; a instancia de limites baixos (global-setup) os reduz.
  UPLOAD_PUT_RATE_MAX: process.env.UPLOAD_PUT_RATE_MAX ?? "1000",
  DECISION_RATE_MAX: process.env.DECISION_RATE_MAX ?? "1000",
  COMMENT_RATE_MAX: process.env.COMMENT_RATE_MAX ?? "1000",
  RECORDING_RATE_MAX: process.env.RECORDING_RATE_MAX ?? "1000",
  CONTENT_CREATE_RATE_MAX: process.env.CONTENT_CREATE_RATE_MAX ?? "1000",
};

const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const filho = spawn(process.execPath, [next, "start", "-p", porta, "-H", "127.0.0.1"], {
  stdio: "inherit",
  env: {
    ...ambiente,
    NODE_ENV: "production",
    DATABASE_URL: url,
    APP_URL: `http://127.0.0.1:${porta}`,
    // Producao exige APP_URL https (B-8); so teste local em loopback usa http, e so com este aviso explicito.
    ALLOW_INSECURE_LOCAL_APP_URL: "true",
    // Os testes enviam x-real-ip proprio (o proxy real o sobrescreve) para isolar o limite por teste.
    // NEXO_TEST_* permite subir variantes (sem proxy confiavel, com TRUSTED_PROXIES e outro cabecalho).
    TRUST_PROXY: process.env.NEXO_TEST_TRUST_PROXY ?? "true",
    TRUSTED_IP_HEADER: process.env.NEXO_TEST_IP_HEADER ?? "x-real-ip",
    TRUSTED_PROXIES: process.env.NEXO_TEST_TRUSTED_PROXIES ?? "",
    AUTH_SIGNIN_RATE_MAX: process.env.AUTH_SIGNIN_RATE_MAX ?? "5",
    AUTH_SIGNIN_EMAIL_MAX: process.env.AUTH_SIGNIN_EMAIL_MAX ?? "10",
    AUTH_SIGNIN_EMAIL_GLOBAL_MAX: process.env.AUTH_SIGNIN_EMAIL_GLOBAL_MAX ?? "100",
    ...armazenamento,
  },
});
const encerrar = () => filho.kill();
process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
filho.on("exit", (code) => process.exit(code ?? 0));
