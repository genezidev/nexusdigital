// Aplica as migrations versionadas e define a senha do papel do app, SO em banco local.
// Uso: node scripts/db-migrar.mjs dev|test
// Recusa qualquer destino que nao seja 127.0.0.1/localhost com banco nexo_dev ou nexo_test.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const alvo = process.argv[2];
const variavel = { dev: "DATABASE_MIGRATE_URL", test: "TEST_DATABASE_MIGRATE_URL" }[alvo];
if (!variavel) {
  console.error("Uso: node scripts/db-migrar.mjs dev|test");
  process.exit(2);
}
const url = process.env[variavel];
const senhaApp = process.env.APP_DB_PASSWORD;
if (!url || !senhaApp) {
  console.error(`Defina ${variavel} e APP_DB_PASSWORD em app/.env (veja .env.example).`);
  process.exit(2);
}
const u = new URL(url);
const bancoPermitido = { dev: "nexo_dev", test: "nexo_test" }[alvo];
if (!["127.0.0.1", "localhost"].includes(u.hostname) || u.pathname !== `/${bancoPermitido}`) {
  console.error(`Recusado: destino precisa ser ${bancoPermitido} em 127.0.0.1/localhost.`);
  process.exit(2);
}

const prismaCli = fileURLToPath(new URL("../node_modules/prisma/build/index.js", import.meta.url));
const r = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_MIGRATE_URL: url },
  cwd: fileURLToPath(new URL("..", import.meta.url)),
});
if (r.status !== 0) process.exit(r.status ?? 1);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  // ALTER ROLE nao aceita parametro: monta o comando no servidor com quote_literal (%L).
  const { rows } = await client.query("SELECT format('ALTER ROLE nexo_app PASSWORD %L', $1::text) AS cmd", [senhaApp]);
  await client.query(rows[0].cmd);
  console.log(`Papel nexo_app com senha definida em ${bancoPermitido}.`);
} finally {
  await client.end();
}
