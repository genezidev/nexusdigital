import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";

// Garante que nexo_test esteja com todas as migrations aplicadas antes dos testes
// (migrate deploy e idempotente; scripts/db-migrar.mjs recusa qualquer outro destino).
export default function setup() {
  const script = path.resolve(__dirname, "../../scripts/db-migrar.mjs");
  const r = spawnSync(process.execPath, [script, "test"], { stdio: "inherit", env: process.env });
  if (r.status !== 0) throw new Error("Falha ao preparar o banco de teste (nexo_test).");
}
