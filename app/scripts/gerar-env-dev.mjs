// Gera app/.env local (ignorado pelo Git) com segredos aleatorios de DEV. Nao sobrescreve.
// Uso: node scripts/gerar-env-dev.mjs
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const alvo = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(alvo)) {
  console.log(".env ja existe; nada foi alterado.");
  process.exit(0);
}
const hex = (n) => randomBytes(n).toString("hex");
const appPw = hex(18);
const linhas = [
  "# Somente desenvolvimento local. Ignorado pelo Git.",
  "# Papel do app (sem BYPASSRLS), usado em runtime:",
  `DATABASE_URL=postgresql://nexo_app:${appPw}@127.0.0.1:5433/nexo_dev`,
  "# Dono do banco: so migrate, seed e setup de papeis:",
  "DATABASE_MIGRATE_URL=postgresql://nexo:nexo_dev_local@127.0.0.1:5433/nexo_dev",
  `TEST_DATABASE_URL=postgresql://nexo_app:${appPw}@127.0.0.1:5433/nexo_test`,
  "TEST_DATABASE_MIGRATE_URL=postgresql://nexo:nexo_dev_local@127.0.0.1:5433/nexo_test",
  `APP_DB_PASSWORD=${appPw}`,
  `SEED_PASSWORD=${randomBytes(12).toString("base64url")}Aa1!`,
  `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64url")}`,
  "APP_URL=http://localhost:3000",
  "# Arquivos privados (R-5): pasta fora de app/ e do Git (ver .gitignore) e segredo das URLs assinadas.",
  `STORAGE_LOCAL_DIR=${fileURLToPath(new URL("../../.storage-local/dev", import.meta.url))}`,
  `STORAGE_SIGNING_SECRET=${randomBytes(32).toString("base64url")}`,
  "",
];
writeFileSync(alvo, linhas.join("\n"), { flag: "wx" });
console.log(".env criado.");
