import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/server/services/invitations";

// M-3: script de provisionamento (papel nexo_app + primeiro ADMIN). Roda contra COPIAS TEMPORARIAS do
// schema (bancos criados so para este teste, com as migrations reais), nunca contra nexo_test/nexo_dev.
// A senha do papel nexo_app e cluster-wide: o teste reaplica a MESMA senha de APP_DB_PASSWORD (nao quebra os demais).

const root = path.resolve(__dirname, "../..");
const script = path.join(root, "scripts/provisionar-producao.mjs");
const ownerUrl = new URL(process.env.TEST_DATABASE_MIGRATE_URL ?? "postgresql://x@127.0.0.1/x");
const appPassword = process.env.APP_DB_PASSWORD ?? "";
const suffix = randomBytes(4).toString("hex");
const dbTest = `nexo_test_prov_${suffix}`;
const dbProd = `provprod_${suffix}`;
const urlFor = (db: string) => {
  const u = new URL(ownerUrl);
  u.pathname = `/${db}`;
  return u.toString();
};

const ADMIN_SENHA = "Kx9-vento-azul-Quartzo7";
const ADMIN_EMAIL = "Primeiro.Admin@Exemplo.Test";

function run(args: string[], env: Record<string, string | undefined>) {
  const base: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(base)) {
    if (/^(DATABASE|TEST_DATABASE|ADMIN_|APP_DB|PROVISIONAR)/.test(k)) delete base[k];
  }
  const r = spawnSync(process.execPath, [script, ...args], { cwd: root, env: { ...base, ...env } as NodeJS.ProcessEnv, encoding: "utf8", input: "", timeout: 60_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

async function withDb<T>(db: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: urlFor(db) });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}
const count = (db: string, sql: string, params: unknown[] = []) => withDb(db, async (c) => (await c.query(sql, params)).rows[0].n as number);
const rolePassword = () => withDb("postgres", async (c) => (await c.query("SELECT rolpassword AS p FROM pg_authid WHERE rolname = 'nexo_app'")).rows[0].p as string);

const good = (db: string, extra: Record<string, string> = {}) => ({
  DATABASE_MIGRATE_URL: urlFor(db),
  APP_DB_PASSWORD: appPassword,
  ADMIN_NOME: "Primeira Pessoa Admin",
  ADMIN_EMAIL: ADMIN_EMAIL,
  ADMIN_SENHA: ADMIN_SENHA,
  ...extra,
});

beforeAll(async () => {
  expect(appPassword.length).toBeGreaterThanOrEqual(24);
  await withDb("postgres", async (c) => {
    await c.query(`CREATE DATABASE "${dbTest}"`);
    await c.query(`CREATE DATABASE "${dbProd}"`);
  });
  for (const db of [dbTest, dbProd]) {
    const r = spawnSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], {
      cwd: root,
      env: { ...process.env, DATABASE_MIGRATE_URL: urlFor(db) },
      encoding: "utf8",
    });
    if (r.status !== 0) throw new Error(`migrate falhou em ${db}: ${r.stdout}${r.stderr}`.slice(0, 500));
  }
}, 120_000);

afterAll(async () => {
  await withDb("postgres", async (c) => {
    await c.query(`DROP DATABASE IF EXISTS "${dbTest}" WITH (FORCE)`);
    await c.query(`DROP DATABASE IF EXISTS "${dbProd}" WITH (FORCE)`);
  });
});

describe("provisionar-producao: o que recusa", () => {
  it("sem --ambiente nao roda, mesmo com banco e senhas corretas (nada e alterado)", async () => {
    const r = run(["--confirmo=test"], good(dbTest));
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/Declare o ambiente/);
    // Tambem sem banco local por tras: sem a flag nem o destino de producao-sem-lista passa
    const semFlagProd = run(["--confirmo=producao"], good(dbProd, { PROVISIONAR_HOST_PERMITIDO: `${ownerUrl.hostname}:${ownerUrl.port}` }));
    expect(semFlagProd.code).toBe(2);
    expect(semFlagProd.out).toMatch(/Declare o ambiente/);
    expect(await count(dbTest, "SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN'")).toBe(0);
    expect(await count(dbProd, "SELECT count(*)::int AS n FROM users")).toBe(0);
  });

  it("destino fora do ambiente declarado: dev em banco de teste, test em nexo_dev, producao em nexo_*", async () => {
    expect(run(["--ambiente=dev", "--confirmo=dev"], good(dbTest)).code).toBe(2);
    expect(run(["--ambiente=test", "--confirmo=test"], good("nexo_dev")).code).toBe(2);
    const prodEmTeste = run(["--ambiente=producao", "--confirmo=producao"], good(dbTest, { PROVISIONAR_HOST_PERMITIDO: "127.0.0.1" }));
    expect(prodEmTeste.code).toBe(2);
    expect(prodEmTeste.out).toMatch(/nexo_dev ou nexo_test/);
    expect(await count(dbTest, "SELECT count(*)::int AS n FROM users")).toBe(0);
  });

  it("recusa host nao autorizado (producao sem lista, com outro host e dev/test em host remoto)", async () => {
    const remoto = "postgresql://dono:x@db.remoto-nao-autorizado.invalid:5432/nexo_producao";
    const semLista = run(["--ambiente=producao", "--confirmo=producao"], good(dbProd, { DATABASE_MIGRATE_URL: remoto }));
    expect(semLista.code).toBe(2);
    expect(semLista.out).toMatch(/PROVISIONAR_HOST_PERMITIDO/);
    const outroHost = run(["--ambiente=producao", "--confirmo=producao"], good(dbProd, { DATABASE_MIGRATE_URL: remoto, PROVISIONAR_HOST_PERMITIDO: "db.outro.example" }));
    expect(outroHost.code).toBe(2);
    expect(outroHost.out).toMatch(/nao esta em PROVISIONAR_HOST_PERMITIDO/);
    const listaDoLocal = run(["--ambiente=producao", "--confirmo=producao"], good(dbProd, { DATABASE_MIGRATE_URL: remoto, PROVISIONAR_HOST_PERMITIDO: "127.0.0.1:5433" }));
    expect(listaDoLocal.code).toBe(2);
    expect(run(["--ambiente=test", "--confirmo=test"], good(dbTest, { DATABASE_MIGRATE_URL: "postgresql://dono:x@db.remoto.invalid:5432/nexo_test" })).code).toBe(2);
    expect(run(["--ambiente=dev", "--confirmo=dev"], good(dbTest, { DATABASE_MIGRATE_URL: "postgresql://dono:x@db.remoto.invalid:5432/nexo_dev" })).code).toBe(2);
  });

  it("recusa senha fraca do administrador e do papel, sem imprimir a senha", async () => {
    const fracas = ["curta1A!", "senhasenha1234", "aaaaaaaaaaaaaaaa", "Primeiro.Admin#2026", "abcd1234efghXYZ", "Nexo-Admin-2026-ok"];
    for (const senha of fracas) {
      const r = run(["--ambiente=test", "--confirmo=test"], good(dbTest, { ADMIN_SENHA: senha }));
      expect(r.code, senha).toBe(2);
      expect(r.out).not.toContain(senha);
    }
    const papelFraco = run(["--ambiente=test", "--confirmo=test"], good(dbTest, { APP_DB_PASSWORD: "curta" }));
    expect(papelFraco.code).toBe(2);
    expect(papelFraco.out).not.toContain("curta");
    expect(await count(dbTest, "SELECT count(*)::int AS n FROM users")).toBe(0);
  });

  it("A-2: query string na URL (host, port, hostaddr, options) nao troca o destino autorizado", async () => {
    // Antes: autorizava localhost/nexo_test pela URL WHATWG, mas o driver pg conectaria no host da query.
    const remoto = "prod.remoto-nao-autorizado.invalid";
    for (const q of [`host=${remoto}`, "port=1", "hostaddr=203.0.113.9", "options=-c%20search_path%3Dx", `sslmode=disable&host=${remoto}`, "sslmode=nao-existe"]) {
      const url = `${urlFor(dbTest)}?${q}`;
      const r = run(["--ambiente=test", "--confirmo=test"], good(dbTest, { DATABASE_MIGRATE_URL: url }));
      expect(r.code, q).toBe(2);
      expect(r.out, q).toMatch(/sslmode/);
      expect(r.out).not.toContain("ECONNREFUSED");
    }
    const mod = (await import(/* @vite-ignore */ pathToFileURL(script).href)) as { autorizarDestino: (a: string, u: string, h?: string) => { host: string; banco: string } };
    expect(() => mod.autorizarDestino("test", `postgresql://u:p@localhost:5433/nexo_test?host=${remoto}`)).toThrow(/sslmode/);
    expect(() => mod.autorizarDestino("producao", `postgresql://u:p@db.autorizado.example:5432/app?host=${remoto}`, "db.autorizado.example")).toThrow(/sslmode/);
    expect(mod.autorizarDestino("test", "postgresql://u:p@localhost:5433/nexo_test?sslmode=disable")).toMatchObject({ host: "localhost", banco: "nexo_test" });
    expect(await count(dbTest, "SELECT count(*)::int AS n FROM users")).toBe(0);
  });

  it("A-6: senhas obvias que a primeira lista deixava passar tambem sao recusadas", async () => {
    for (const senha of ["zxcvbnmasdfg", "P@ssw0rd!!!!", "Summer2026!x", "Qwerty-Teclado-91", "Inverno2026-ok", "Passw0rd-Forte-77", "Lago-tyuio-Fogo-83", "Pedra-poiuyt-Rio-58"]) {
      const r = run(["--ambiente=test", "--confirmo=test"], good(dbTest, { ADMIN_SENHA: senha }));
      expect(r.code, senha).toBe(2);
      expect(r.out).not.toContain(senha);
    }
    expect(await count(dbTest, "SELECT count(*)::int AS n FROM users")).toBe(0);
  });

  it("segredo por argumento e recusado e a confirmacao e obrigatoria (sem terminal para perguntar)", async () => {
    const porArgv = run(["--ambiente=test", "--confirmo=test", `--senha=${ADMIN_SENHA}`], good(dbTest));
    expect(porArgv.code).toBe(2);
    expect(porArgv.out).not.toContain(ADMIN_SENHA);
    const semConfirmar = run(["--ambiente=test"], good(dbTest));
    expect(semConfirmar.code).toBe(2);
    expect(await count(dbTest, "SELECT count(*)::int AS n FROM users")).toBe(0);
  });

  it("banco sem migrations e recusado antes de gravar", async () => {
    const vazio = `nexo_test_prov_vazio${suffix}`;
    await withDb("postgres", (c) => c.query(`CREATE DATABASE "${vazio}"`));
    try {
      const r = run(["--ambiente=test", "--confirmo=test"], good(vazio));
      expect(r.code).toBe(4);
      expect(r.out).toMatch(/migrations/);
    } finally {
      await withDb("postgres", (c) => c.query(`DROP DATABASE IF EXISTS "${vazio}" WITH (FORCE)`));
    }
  });
});

describe("provisionar-producao: cria o primeiro ADMIN, de forma idempotente e sem imprimir segredo", () => {
  it("cria admin, grava auditoria, rotaciona o papel e nao imprime nenhuma senha", async () => {
    const antes = await rolePassword();
    const r = run(["--ambiente=test", "--confirmo=test"], good(dbTest));
    expect(r.code, r.out).toBe(0);
    for (const segredo of [ADMIN_SENHA, appPassword]) expect(r.out).not.toContain(segredo);
    expect(r.out).not.toMatch(/SCRAM-SHA|scrypt/i);

    const user = await withDb(dbTest, async (c) => (await c.query("SELECT id, name, email, role, email_verified, banned FROM users")).rows);
    expect(user).toHaveLength(1);
    expect(user[0]).toMatchObject({ name: "Primeira Pessoa Admin", email: ADMIN_EMAIL.toLowerCase(), role: "ADMIN", email_verified: true, banned: false });
    const conta = await withDb(dbTest, async (c) => (await c.query("SELECT provider_id, password FROM accounts WHERE user_id = $1", [user[0].id])).rows[0]);
    expect(conta.provider_id).toBe("credential");
    expect(conta.password).not.toContain(ADMIN_SENHA);
    expect(conta.password).toMatch(/^[0-9a-f]+:[0-9a-f]+$/); // salt:hash do Better Auth
    const audit = await withDb(dbTest, async (c) => (await c.query("SELECT actor_id, action, diff FROM audit_logs")).rows);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: user[0].id, action: "admin.provisioned" });
    expect(JSON.stringify(audit[0].diff)).not.toContain(ADMIN_SENHA);
    expect(JSON.stringify(audit[0].diff)).not.toContain(appPassword);

    // A senha do papel mudou (verificador novo) e continua valendo para o app.
    const depois = await rolePassword();
    expect(depois).toMatch(/^SCRAM-SHA-256\$/);
    expect(depois).not.toBe(antes);
    const appUrl = new URL(ownerUrl);
    appUrl.username = "nexo_app";
    appUrl.password = appPassword;
    appUrl.pathname = `/${dbTest}`;
    const app = new pg.Client({ connectionString: appUrl.toString() });
    await app.connect();
    await app.end();
  });

  it("o hash gravado e aceito pelo login do Better Auth", async () => {
    const { verifyPassword } = await import("better-auth/crypto");
    const hash = await withDb(dbTest, async (c) => (await c.query("SELECT password FROM accounts")).rows[0].password as string);
    expect(await verifyPassword({ hash, password: ADMIN_SENHA })).toBe(true);
    expect(await verifyPassword({ hash, password: `${ADMIN_SENHA}x` })).toBe(false);
  });

  it("segunda execucao recusa (codigo 3) sem alterar nada, nem a senha do papel", async () => {
    const antes = await rolePassword();
    const r = run(["--ambiente=test", "--confirmo=test"], good(dbTest, { ADMIN_EMAIL: "outro.admin@exemplo.test" }));
    expect(r.code).toBe(3);
    expect(r.out).toMatch(/Ja existe um administrador/);
    expect(await count(dbTest, "SELECT count(*)::int AS n FROM users")).toBe(1);
    expect(await count(dbTest, "SELECT count(*)::int AS n FROM audit_logs")).toBe(1);
    expect(await rolePassword()).toBe(antes);
  });

  it("--somente-papel rotaciona so a senha do papel (sem dados de admin) e --permitir-outro-admin exige flag explicita", async () => {
    const antes = await rolePassword();
    const rot = run(["--ambiente=test", "--confirmo=test", "--somente-papel"], { DATABASE_MIGRATE_URL: urlFor(dbTest), APP_DB_PASSWORD: appPassword });
    expect(rot.code, rot.out).toBe(0);
    expect(await rolePassword()).not.toBe(antes);
    expect(await count(dbTest, "SELECT count(*)::int AS n FROM users")).toBe(1);

    const outro = run(["--ambiente=test", "--confirmo=test", "--permitir-outro-admin"], good(dbTest, { ADMIN_EMAIL: "segundo.admin@exemplo.test", ADMIN_SENHA: "Lago-pedra-Fogo-83" }));
    expect(outro.code, outro.out).toBe(0);
    expect(await count(dbTest, "SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN'")).toBe(2);
    const repetido = run(["--ambiente=test", "--confirmo=test", "--permitir-outro-admin"], good(dbTest, { ADMIN_EMAIL: "segundo.admin@exemplo.test", ADMIN_SENHA: "Lago-pedra-Fogo-83" }));
    expect(repetido.code).toBe(3);
    expect(await count(dbTest, "SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN'")).toBe(2);
  });

  it("--ambiente=producao funciona so com o host na lista e banco que nao seja nexo_dev/nexo_test", async () => {
    const semLista = run(["--ambiente=producao", "--confirmo=producao"], good(dbProd));
    expect(semLista.code).toBe(2);
    expect(await count(dbProd, "SELECT count(*)::int AS n FROM users")).toBe(0);
    const ok = run(["--ambiente=producao", "--confirmo=producao"], good(dbProd, { PROVISIONAR_HOST_PERMITIDO: `outro.example, ${ownerUrl.hostname}:${ownerUrl.port}` }));
    expect(ok.code, ok.out).toBe(0);
    expect(ok.out).toContain("(producao)");
    expect(await count(dbProd, "SELECT count(*)::int AS n FROM users WHERE role = 'ADMIN'")).toBe(1);
    expect(ok.out).not.toContain(ADMIN_SENHA);
  });
});

describe("limites iguais aos do app", () => {
  it("minimo e maximo de senha do script sao os do app", async () => {
    const mod = (await import(/* @vite-ignore */ pathToFileURL(script).href)) as { MIN_SENHA: number; MAX_SENHA: number };
    expect(mod.MIN_SENHA).toBe(MIN_PASSWORD_LENGTH);
    expect(mod.MAX_SENHA).toBe(MAX_PASSWORD_LENGTH);
  });
});
