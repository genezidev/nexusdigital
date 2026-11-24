// Roda o seed de demonstracao no banco local. Uso: node scripts/db-seed.mjs dev|test
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const alvo = process.argv[2];
const variavel = { dev: "DATABASE_MIGRATE_URL", test: "TEST_DATABASE_MIGRATE_URL" }[alvo];
if (!variavel || !process.env[variavel]) {
  console.error("Uso: node scripts/db-seed.mjs dev|test (com a URL definida em app/.env)");
  process.exit(2);
}
const tsx = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const seed = fileURLToPath(new URL("../prisma/seed.ts", import.meta.url));
const r = spawnSync(process.execPath, [tsx, seed], {
  stdio: "inherit",
  env: { ...process.env, SEED_TARGET_URL: process.env[variavel] },
});
process.exit(r.status ?? 1);
