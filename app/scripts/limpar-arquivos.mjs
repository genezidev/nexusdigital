// Comando de limpeza de arquivos pendentes, orfaos e temporarios (idempotente). Uso:
//   node scripts/limpar-arquivos.mjs [--ambiente dev|test|producao] [--horas 24]
// "dev" e "producao" usam DATABASE_URL do ambiente; "test" usa TEST_DATABASE_URL (nexo_test). Segredos nunca sao impressos.
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const valor = (nome, padrao) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};
const ambiente = valor("--ambiente", "dev");
if (!["dev", "test", "producao"].includes(ambiente)) {
  console.error("Uso: node scripts/limpar-arquivos.mjs [--ambiente dev|test|producao] [--horas 24]");
  process.exit(2);
}
const env = { ...process.env, LIMPAR_HORAS: valor("--horas", "24") };
if (ambiente === "test") {
  if (!process.env.TEST_DATABASE_URL) {
    console.error("Defina TEST_DATABASE_URL em app/.env.");
    process.exit(2);
  }
  env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
const tsx = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const alvo = fileURLToPath(new URL("./limpar-arquivos.ts", import.meta.url));
const r = spawnSync(process.execPath, [tsx, alvo], { stdio: "inherit", env });
process.exit(r.status ?? 1);
