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

  // Instancia principal (atras de proxy que define x-real-ip) e duas variantes para os testes de M-1.
  const variants: { port: number; env: Record<string, string> }[] = [
    { port: HTTP_PORT, env: {} },
    { port: HTTP_PORT + 1, env: { NEXO_TEST_TRUST_PROXY: "false" } },
    { port: HTTP_PORT + 2, env: { NEXO_TEST_IP_HEADER: "x-forwarded-for", NEXO_TEST_TRUSTED_PROXIES: "10.250.0.0/16,192.0.2.1" } },
    // Limites baixos de falhas por e-mail (3 por e-mail e IP, 6 no total) e limite por IP folgado.
    // Na mesma instancia: limites baixos de pedidos de envio e de download (por pessoa), no maximo 2 envios pendentes e
    // links de download de 5 s (para provar expiracao com relogio real).
    {
      port: HTTP_PORT + 3,
      env: {
        AUTH_SIGNIN_RATE_MAX: "1000",
        AUTH_SIGNIN_EMAIL_MAX: "3",
        AUTH_SIGNIN_EMAIL_GLOBAL_MAX: "6",
        UPLOAD_RATE_MAX: "4",
        DOWNLOAD_RATE_MAX: "4",
        MAX_PENDING_UPLOADS_PER_USER: "3",
        DOWNLOAD_URL_TTL_SECONDS: "5",
      },
    },
    // Limites BAIXOS por pessoa das demais mutacoes (B-5): decisao 2, comentario 3, gravacao 2, criacao de conteudo 3 e
    // envio dos bytes 2, por janela de 10 min. Os outros apps os deixam folgados.
    {
      port: HTTP_PORT + 4,
      env: {
        AUTH_SIGNIN_RATE_MAX: "1000",
        DECISION_RATE_MAX: "2",
        COMMENT_RATE_MAX: "3",
        RECORDING_RATE_MAX: "2",
        CONTENT_CREATE_RATE_MAX: "3",
        UPLOAD_PUT_RATE_MAX: "2",
        // D-0025 e D-0026: links de midia e equipe, 3 por janela de 10 min e por pessoa.
        MEDIA_LINK_RATE_MAX: "3",
        TEAM_RATE_MAX: "3",
      },
    },
    // D-0025: UPLOADS_ENABLED=false (o padrao real). Nenhuma rota de pedido, envio ou download de arquivo existe.
    { port: HTTP_PORT + 5, env: { NEXO_TEST_UPLOADS: "false" } },
  ];
  const children: ChildProcess[] = [];
  let exited = false;
  for (const v of variants) {
    const child = spawn(process.execPath, [path.join(root, "scripts/iniciar-app-teste.mjs"), String(v.port)], {
      cwd: root,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, ...v.env },
    });
    child.on("exit", () => {
      exited = true;
    });
    children.push(child);
  }

  const deadline = Date.now() + 120_000;
  for (const v of variants) {
    const base = `http://127.0.0.1:${v.port}`;
    for (;;) {
      if (exited) throw new Error("Um app de teste encerrou antes de ficar pronto (porta ocupada?).");
      try {
        const r = await fetch(`${base}/login`, { redirect: "manual" });
        if (r.status === 200) break;
      } catch {
        // ainda subindo
      }
      if (Date.now() > deadline) {
        for (const c of children) c.kill();
        throw new Error("O app de teste nao respondeu em 120 s.");
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return async () => {
    for (const c of children) c.kill();
  };
}
