import "dotenv/config";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const HTTP_PORT = 3100;

// Aplica as migrations em nexo_test, sobe `next start` (build ja feito) contra nexo_test e espera responder.
export default async function setup() {
  const root = path.resolve(__dirname, "../..");
  if (!existsSync(path.join(root, ".next", "BUILD_ID"))) {
    throw new Error("Falta o build: rode `node node_modules/next/dist/bin/next build` em app/ antes dos testes HTTP.");
  }
  const migrate = spawnSync(process.execPath, [path.join(root, "scripts/db-migrar.mjs"), "test"], { stdio: "inherit", env: process.env });
  if (migrate.status !== 0) throw new Error("Falha ao preparar o banco de teste (nexo_test).");

  const child: ChildProcess = spawn(process.execPath, [path.join(root, "scripts/iniciar-app-teste.mjs"), String(HTTP_PORT)], {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
  });
  let exited = false;
  child.on("exit", () => {
    exited = true;
  });

  const base = `http://127.0.0.1:${HTTP_PORT}`;
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (exited) throw new Error("O app de teste encerrou antes de ficar pronto (porta ocupada?).");
    try {
      const r = await fetch(`${base}/login`, { redirect: "manual" });
      if (r.status === 200) break;
    } catch {
      // ainda subindo
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error("O app de teste nao respondeu em 90 s.");
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return async () => {
    child.kill();
  };
}
