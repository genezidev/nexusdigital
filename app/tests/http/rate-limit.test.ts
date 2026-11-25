import { spawn } from "node:child_process";
import { createHash, randomInt, randomUUID } from "node:crypto";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { makeWorld, ownerDb, TEST_PASSWORD, type World } from "../integration/helpers/world";
import { BASE, BASE_CHAIN, BASE_LOW, BASE_NO_PROXY, err, expectNoLeak, http, uniqueIp } from "./helpers/http";

// M-1: limite de tentativas que nao depende de o proxy estar certo e nunca vira balde global.
// Tres instancias do app compilado (tests/http/global-setup.ts): BASE (TRUST_PROXY=true, cabecalho x-real-ip),
// BASE_NO_PROXY (TRUST_PROXY=false) e BASE_CHAIN (x-forwarded-for com TRUSTED_PROXIES=10.250.0.0/16,192.0.2.1).

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});

const wrong = "senha-errada-12345";
const signIn = (email: string, opts: Parameters<typeof http>[1] = {}, password = wrong) =>
  http("/api/auth/sign-in/email", { method: "POST", body: { email, password }, ...opts });
const ghostEmail = () => `fantasma-${randomUUID().slice(0, 8)}@nao-existe.test`;
const keysLike = async (pattern: string) => ownerDb.rateLimit.findMany({ where: { key: { contains: pattern } } });

describe("inicializacao em producao exige TRUST_PROXY explicito", () => {
  const root = path.resolve(__dirname, "../..");
  function start(extra: Record<string, string | undefined>) {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", DATABASE_URL: process.env.TEST_DATABASE_URL, APP_URL: "http://127.0.0.1:3199", ALLOW_INSECURE_LOCAL_APP_URL: "true", ...extra };
    for (const k of Object.keys(env)) if (k === "TEST" || k.startsWith("VITEST")) delete env[k];
    if (extra.TRUST_PROXY === undefined) delete env.TRUST_PROXY;
    const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", "3199", "-H", "127.0.0.1"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout?.on("data", (d) => (output += d));
    child.stderr?.on("data", (d) => (output += d));
    const exit = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
    return { child, exit, output: () => output };
  }

  it("sem TRUST_PROXY o processo encerra na partida, citando so o nome da variavel", async () => {
    const run = start({ TRUST_PROXY: undefined });
    const code = await Promise.race([run.exit, new Promise<"vivo">((r) => setTimeout(() => r("vivo"), 40_000))]);
    run.child.kill();
    expect(code, `o app nao deveria iniciar sem TRUST_PROXY. Saida: ${run.output().slice(0, 300)}`).not.toBe("vivo");
    expect(code).not.toBe(0);
    expect(run.output()).toMatch(/TRUST_PROXY/);
    expect(run.output()).not.toContain(process.env.BETTER_AUTH_SECRET ?? "segredo-ausente");
  }, 60_000);

  it("controle: com TRUST_PROXY=false o mesmo comando sobe e responde", async () => {
    const run = start({ TRUST_PROXY: "false" });
    let status = 0;
    for (let i = 0; i < 60 && status !== 200; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        status = (await fetch("http://127.0.0.1:3199/login", { redirect: "manual" })).status;
      } catch {
        // subindo
      }
    }
    run.child.kill();
    expect(status, run.output().slice(0, 300)).toBe(200);
  }, 60_000);
});

describe("TRUST_PROXY=false: nenhum cabecalho vale e nao existe balde global", () => {
  it("um anonimo martelando o login nao bloqueia o login de outro usuario", async () => {
    const before = (await keysLike("app:auth-ip:/sign-in/email:")).length;
    // O anonimo forja cabecalhos de IP a vontade e erra a senha de varios e-mails, sem IP confiavel.
    for (let i = 0; i < 40; i++) {
      const r = await signIn(ghostEmail(), { base: BASE_NO_PROXY, headers: { "x-real-ip": uniqueIp(), "x-forwarded-for": uniqueIp() } });
      expect(r.status).toBe(401);
    }
    // Outro usuario, outro e-mail: entra normalmente.
    const ok = await signIn(w.ownerA.email, { base: BASE_NO_PROXY, noIp: true }, TEST_PASSWORD);
    expect(ok.status).toBe(200);
    // Nenhum cabecalho forjado virou chave de IP.
    expect((await keysLike("app:auth-ip:/sign-in/email:")).length).toBe(before);
  });

  it("sem IP o anonimo so gasta o balde do proprio e-mail (11a falha no mesmo e-mail: 429)", async () => {
    const email = ghostEmail();
    const out: number[] = [];
    for (let i = 0; i < 12; i++) out.push((await signIn(email, { base: BASE_NO_PROXY, noIp: true })).status);
    expect(out.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(out.slice(10)).toEqual([429, 429]);
    // outro e-mail, mesma origem anonima: nao e afetado
    expect((await signIn(ghostEmail(), { base: BASE_NO_PROXY, noIp: true })).status).toBe(401);
  });

  it("aceite de convite sem IP confiavel limita pelo token, sem afetar outro token", async () => {
    const accept = (token: string) =>
      http("/api/invitations/accept", { method: "POST", base: BASE_NO_PROXY, noIp: true, body: { token, name: "Chute Ficticio", password: "senha-bem-longa-12345" } });
    const a = "a".repeat(40) + randomUUID().replaceAll("-", "").slice(0, 8);
    const out: number[] = [];
    for (let i = 0; i < 12; i++) out.push((await accept(a)).status);
    expect(out.slice(0, 10).every((s) => s === 410)).toBe(true);
    expect(out[11]).toBe(429);
    expect((await accept("b".repeat(40) + randomUUID().replaceAll("-", "").slice(0, 8))).status).toBe(410);
  });
});

describe("TRUST_PROXY=true com cabecalho x-real-ip", () => {
  it("IP valido: 6a tentativa e 429; outro IP nao e afetado", async () => {
    const ip = uniqueIp();
    const out: number[] = [];
    for (let i = 0; i < 7; i++) out.push((await signIn(ghostEmail(), { ip })).status);
    expect(out).toEqual([401, 401, 401, 401, 401, 429, 429]);
    expect((await signIn(ghostEmail())).status).toBe(401);
  });

  it("cabecalho interno forjado pelo cliente e descartado (nao da IP novo a cada tentativa)", async () => {
    const ip = uniqueIp();
    const out: number[] = [];
    for (let i = 0; i < 7; i++) out.push((await signIn(ghostEmail(), { ip, headers: { "x-nexo-client-ip": uniqueIp() } })).status);
    expect(out.slice(5)).toEqual([429, 429]);
  });

  it("varios valores no cabecalho (o primeiro e forjavel): ambiguo, sem balde de IP, e girar o primeiro valor nao ajuda nem prejudica", async () => {
    const before = (await keysLike("app:auth-ip:/sign-in/email:")).length;
    const real = uniqueIp();
    const out: number[] = [];
    for (let i = 0; i < 8; i++) out.push((await signIn(ghostEmail(), { headers: { "x-real-ip": `${uniqueIp()}, ${real}` } })).status);
    expect(out.every((s) => s === 401)).toBe(true);
    expect((await keysLike("app:auth-ip:/sign-in/email:")).length).toBe(before);
    expect(await keysLike(`/sign-in/email:${real}`)).toEqual([]);
  });

  it("IP invalido ou enorme: sem balde de IP e sem balde global; outro usuario entra", async () => {
    const before = (await keysLike("app:auth-ip:/sign-in/email:")).length;
    for (const lixo of ["nao-e-um-ip", "999.999.999.999", "1.2.3.4:80", "<script>alert(1)</script>", "a".repeat(8000)]) {
      for (let i = 0; i < 7; i++) {
        const r = await signIn(ghostEmail(), { headers: { "x-real-ip": lixo } });
        expect(r.status, lixo.slice(0, 20)).toBe(401);
        expectNoLeak(r);
      }
    }
    expect((await keysLike("app:auth-ip:/sign-in/email:")).length).toBe(before);
    expect(await keysLike("nao-e-um-ip")).toEqual([]);
    expect((await signIn(w.collabA.email, {}, TEST_PASSWORD)).status).toBe(200);
  });

  it("IPv6: enderecos do mesmo /64 dividem o balde (girar o final nao escapa do limite)", async () => {
    const net = `2001:db8:${randomInt(1, 60000).toString(16)}:${randomInt(1, 60000).toString(16)}`;
    const out: number[] = [];
    for (let i = 0; i < 7; i++) out.push((await signIn(ghostEmail(), { ip: `${net}::${randomInt(1, 60000).toString(16)}` })).status);
    expect(out.slice(5)).toEqual([429, 429]);
    // IPv4 mapeado em IPv6 equivale ao IPv4
    const v4 = uniqueIp();
    for (let i = 0; i < 5; i++) await signIn(ghostEmail(), { ip: v4 });
    expect((await signIn(ghostEmail(), { ip: `::ffff:${v4}` })).status).toBe(429);
  });

  it("corpo grande demais e recusado com 413, sem vazar detalhe", async () => {
    const r = await http("/api/auth/sign-in/email", { method: "POST", body: { email: ghostEmail(), password: "x".repeat(20_000) } });
    expect(r.status).toBe(413);
    expect(err(r)?.code).toBe("PAYLOAD_TOO_LARGE");
    expectNoLeak(r);
  });
});

describe("cadeia x-forwarded-for com TRUSTED_PROXIES", () => {
  it("valores forjados a esquerda sao ignorados: o cliente real, antes dos proxies proprios, e quem conta", async () => {
    const client = `203.0.113.${randomInt(1, 250)}`;
    const out: number[] = [];
    for (let i = 0; i < 7; i++) {
      out.push((await signIn(ghostEmail(), { base: BASE_CHAIN, noIp: true, headers: { "x-forwarded-for": `${uniqueIp()}, ${client}, 10.250.1.1` } })).status);
    }
    expect(out).toEqual([401, 401, 401, 401, 401, 429, 429]);
    // outro cliente real nao e afetado
    const other = `203.0.113.${randomInt(1, 250)}`;
    expect((await signIn(ghostEmail(), { base: BASE_CHAIN, noIp: true, headers: { "x-forwarded-for": `${other}, 10.250.1.1` } })).status).toBe(401);
  });
});

describe("a instancia principal continua isolando por IP", () => {
  it("BASE responde 200 no login de quem acerta", async () => {
    expect(BASE).toContain("3100");
    expect((await signIn(w.ownerA.email, {}, TEST_PASSWORD)).status).toBe(200);
  });
});

// A-1: o guard le o corpo do mesmo jeito que o Better Auth. Nenhum formato "escapa" da contagem.
describe("formatos de corpo no login (A-1)", () => {
  const login = (email: string, opts: Parameters<typeof http>[1]) => http("/api/auth/sign-in/email", { method: "POST", base: BASE_NO_PROXY, noIp: true, ...opts });
  const json = (email: string, password = wrong) => JSON.stringify({ email, password });
  const bom = (text: string) => new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]);

  it("form-urlencoded, text/plain e sem Content-Type: 415, sem chegar ao Better Auth (nem com a senha certa)", async () => {
    const email = w.ownerA.email;
    const form = `email=${encodeURIComponent(email)}&password=${encodeURIComponent(TEST_PASSWORD)}`;
    for (const contentType of ["application/x-www-form-urlencoded", "text/plain", "text/plain;charset=UTF-8", "multipart/form-data; boundary=x", "application/jsonx", null]) {
      const r = await login(email, { rawBody: contentType === "text/plain" ? json(email, TEST_PASSWORD) : form, contentType });
      expect(r.status, String(contentType)).toBe(415);
      expect(err(r)?.code).toBe("UNSUPPORTED_MEDIA_TYPE");
      expect(r.headers.getSetCookie()).toHaveLength(0);
      expectNoLeak(r);
    }
  });

  it("JSON com BOM e com charset diferente chegam ao Better Auth, mas sao CONTADOS: forca bruta sem IP para na 11a", async () => {
    const formatos: { nome: string; corpo: (email: string) => Uint8Array | string; contentType: string }[] = [
      { nome: "BOM", corpo: (e) => bom(json(e)), contentType: "application/json" },
      { nome: "charset", corpo: (e) => json(e), contentType: "application/json; charset=utf-16" },
      { nome: "caixa alta", corpo: (e) => json(e), contentType: "Application/JSON" },
      { nome: "e-mail em maiusculas e espacos", corpo: (e) => json(` ${e.toUpperCase()} `), contentType: "application/json" },
    ];
    for (const f of formatos) {
      const email = ghostEmail();
      const out: number[] = [];
      for (let i = 0; i < 12; i++) out.push((await login(email, { rawBody: f.corpo(email), contentType: f.contentType })).status);
      expect(out.slice(0, 10).every((s) => s === 401 || s === 400), `${f.nome}: ${out.join(",")}`).toBe(true);
      expect(out.slice(10), f.nome).toEqual([429, 429]);
    }
  });

  it("misturar formatos nao multiplica as tentativas: BOM e JSON comum dividem o mesmo balde do e-mail", async () => {
    const email = ghostEmail();
    const out: number[] = [];
    for (let i = 0; i < 12; i++) {
      out.push((await (i % 2 ? login(email, { rawBody: bom(json(email)), contentType: "application/json" }) : login(email, { body: { email, password: wrong } }))).status);
    }
    expect(out.slice(10)).toEqual([429, 429]);
  });

  it("JSON invalido, nao-objeto, sem e-mail ou com e-mail que nao e texto: 400, sem chegar ao Better Auth", async () => {
    for (const corpo of ["{nao e json", "[]", "null", "42", "{}", '{"password":"x"}', '{"email":["a@b.test"],"password":"x"}', '{"email":123,"password":"x"}', '{"email":"","password":"x"}', ""]) {
      const r = await login("x", { rawBody: corpo, contentType: "application/json" });
      expect(r.status, corpo).toBe(400);
      expect(err(r)?.code).toBe("BAD_REQUEST");
      expectNoLeak(r);
    }
  });

  it("redefinicao: token no corpo ou na query e contado; sem token: 400; formatos nao-JSON: 415", async () => {
    const reset = (query: string, corpo: unknown, extra: Parameters<typeof http>[1] = {}) =>
      http(`/api/auth/reset-password${query}`, { method: "POST", base: BASE_NO_PROXY, noIp: true, body: corpo, ...extra });
    const novaSenha = "outra-senha-bem-longa-12345";
    const tokenCorpo = `corpo-${randomUUID()}`;
    const tokenQuery = `query-${randomUUID()}`;
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < 7; i++) {
      a.push((await reset("", { token: tokenCorpo, newPassword: novaSenha })).status);
      b.push((await reset(`?token=${tokenQuery}`, { newPassword: novaSenha })).status);
    }
    expect(a.slice(0, 5).every((s) => s === 400)).toBe(true);
    expect(a.slice(5)).toEqual([429, 429]);
    expect(b.slice(0, 5).every((s) => s === 400)).toBe(true);
    expect(b.slice(5)).toEqual([429, 429]);
    // sem token em lugar nenhum
    const sem = await reset("", { newPassword: novaSenha });
    expect(sem.status).toBe(400);
    expect(err(sem)?.code).toBe("BAD_REQUEST");
    // token so na query, corpo vazio de token: usa a query (mesma regra do Better Auth)
    expect((await reset(`?token=${tokenQuery}`, { token: "", newPassword: novaSenha })).status).toBe(429);
    const form = await reset(`?token=${tokenQuery}`, undefined, { rawBody: `token=${tokenQuery}&newPassword=x`, contentType: "application/x-www-form-urlencoded" });
    expect(form.status).toBe(415);
  });

  it("pedido de redefinicao sem e-mail valido: 400 (a menos que o envio esteja indisponivel, que e o 503 uniforme)", async () => {
    const r = await http("/api/auth/request-password-reset", { method: "POST", base: BASE_NO_PROXY, noIp: true, body: { redirectTo: "/reset-password" } });
    expect([400, 503]).toContain(r.status);
  });
});

// A-3: so FALHAS contam; um anonimo de outro IP nao tranca o login de quem tem a senha certa.
describe("limite de falhas por e-mail e IP (A-3), instancia com limites baixos (3 por e-mail e IP, 6 no total)", () => {
  const login = (email: string, ip: string, password = wrong) => signIn(email, { base: BASE_LOW, ip }, password);
  const fresh = (label: string) => `${label}-${randomUUID().slice(0, 8)}@nao-existe.test`;

  it("um anonimo errando a senha do ADMIN de outro IP nao impede o admin de entrar", async () => {
    const adminEmail = w.admin.email;
    const atacante = uniqueIp();
    const out: number[] = [];
    for (let i = 0; i < 6; i++) out.push((await login(adminEmail, atacante)).status);
    expect(out).toEqual([401, 401, 401, 429, 429, 429]);
    // o atacante continua barrado, mesmo com a senha certa (balde dele)
    expect((await login(adminEmail, atacante, TEST_PASSWORD)).status).toBe(429);
    // o admin, de outro IP, entra
    expect((await login(adminEmail, uniqueIp(), TEST_PASSWORD)).status).toBe(200);
  });

  it("429 identico para conta existente e inexistente (sem enumeracao)", async () => {
    const ip = uniqueIp();
    const ghost = fresh("fantasma");
    const real = w.collabA.email;
    for (let i = 0; i < 3; i++) {
      await login(real, ip);
      await login(ghost, ip);
    }
    const a = await login(real, ip);
    const b = await login(ghost, ip);
    expect([a.status, b.status]).toEqual([429, 429]);
    expect(err(a)?.code).toBe("RATE_LIMITED");
    expect(err(a)?.code).toBe(err(b)?.code);
    expect(err(a)?.message).toBe(err(b)?.message);
    expect(a.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(a.text.replace(/"requestId":"[^"]+"/, "")).toBe(b.text.replace(/"requestId":"[^"]+"/, ""));
  });

  it("so falhas contam: logins certos repetidos nao gastam o balde, e o sucesso devolve a vaga", async () => {
    const ip = uniqueIp();
    const email = w.ownerB.email;
    for (let i = 0; i < 8; i++) expect((await login(email, ip, TEST_PASSWORD)).status, `acerto ${i}`).toBe(200);
    // duas falhas, um acerto, duas falhas: nunca passa de 3 falhas seguidas, nao trava
    const out: number[] = [];
    for (const senha of [wrong, wrong, TEST_PASSWORD, wrong, wrong, TEST_PASSWORD]) out.push((await login(email, uniqueIp(), senha)).status);
    expect(out).toEqual([401, 401, 200, 401, 401, 200]);
  });

  it("quem ja entrou com sucesso daquele IP nao e barrado pelo balde (e-mail, IP) quando alguem erra a senha dele", async () => {
    const email = w.staffAssignedA.email;
    const ip = uniqueIp();
    expect((await login(email, ip, TEST_PASSWORD)).status).toBe(200); // marca "ja entrou deste IP"
    // erros vindos do mesmo IP (ex.: NAT compartilhado): passam de 3 sem 429, ate o teto de 6 por e-mail
    const out: number[] = [];
    for (let i = 0; i < 5; i++) out.push((await login(email, ip)).status);
    expect(out).toEqual([401, 401, 401, 401, 401]);
    expect((await login(email, ip, TEST_PASSWORD)).status).toBe(200);
  });

  it("teto por e-mail (6 falhas de IPs diferentes) contra ataque distribuido: 429 para todos, inclusive IP novo", async () => {
    const email = fresh("distribuido");
    const out: number[] = [];
    for (let i = 0; i < 8; i++) out.push((await login(email, uniqueIp())).status);
    expect(out).toEqual([401, 401, 401, 401, 401, 401, 429, 429]);
    // limite residual documentado: nem o dono de uma conta atacada assim entra durante a janela
    const ghostOwner = await login(email, uniqueIp(), TEST_PASSWORD);
    expect(ghostOwner.status).toBe(429);
  });

  it("o ataque de forca bruta continua limitado: de um IP, 3 falhas por e-mail e a quarta e 429", async () => {
    const ip = uniqueIp();
    const email = fresh("bruta");
    const out: number[] = [];
    for (let i = 0; i < 5; i++) out.push((await login(email, ip)).status);
    expect(out).toEqual([401, 401, 401, 429, 429]);
    // varios e-mails do mesmo IP: cada um tem o proprio balde
    expect((await login(fresh("outro"), ip)).status).toBe(401);
  });
});
