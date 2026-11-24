import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";

// Prepara nexo_test (migrations + usuarios ficticios do seed) antes das jornadas. Recusa outro destino.
export default function globalSetup() {
  const root = path.resolve(__dirname, "..");
  for (const script of ["db-migrar.mjs", "db-seed.mjs"]) {
    const r = spawnSync(process.execPath, [path.join(root, "scripts", script), "test"], { stdio: "inherit", env: process.env });
    if (r.status !== 0) throw new Error(`Falha em ${script} test`);
  }
  if (!process.env.SEED_PASSWORD) throw new Error("Defina SEED_PASSWORD em app/.env (senha dos usuarios ficticios do seed).");
}
