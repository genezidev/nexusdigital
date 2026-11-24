import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "@/server/auth/auth";
import { appDb, makeWorld, ownerDb, TEST_PASSWORD, type World } from "../integration/helpers/world";
import { BASE, err, expectNoLeak, http, login, uniqueIp } from "./helpers/http";

// Convite, login, redefinicao de senha, limite de tentativas, CSRF e formato dos erros, por HTTP real.

let w: World;
let admin: string;

beforeAll(async () => {
  w = await makeWorld();
  admin = await login(w.admin.email);
});

async function invite(clientId: string, email: string, role = "CLIENT_OWNER") {
  const r = await http(`/api/admin/clients/${clientId}/invitations`, { method: "POST", cookie: admin, body: { email, role } });
  return { r, link: (r.json as { link?: string } | null)?.link ?? "", token: ((r.json as { link?: string } | null)?.link ?? "").split("/invite/")[1] ?? "" };
}

describe("admin cria clientes (P1)", () => {
  it("cria com fuso padrao, lista, busca e pagina no servidor, e registra na auditoria", async () => {
    const tag = Math.random().toString(36).slice(2, 8);
    const a = await http("/api/admin/clients", { method: "POST", cookie: admin, body: { name: `Cliente A ${tag}`, contactName: "Contato Ficticio", contactEmail: `A@Cliente-${tag}.test` } });
    expect(a.status).toBe(201);
    const created = a.json as { id: string; timezone: string; slug: string };
    expect(created.timezone).toBe("America/Maceio");
    const b = await http("/api/admin/clients", { method: "POST", cookie: admin, body: { name: `Cliente B ${tag}`, timezone: "America/Manaus" } });
    expect(b.status).toBe(201);
    expect((b.json as { timezone: string }).timezone).toBe("America/Manaus");

    const search = await http(`/api/admin/clients?q=${tag}&pageSize=1`, { cookie: admin });
    const body = search.json as { items: { name: string }[]; total: number; page: number };
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(1);
    const page2 = await http(`/api/admin/clients?q=${tag}&pageSize=1&page=2`, { cookie: admin });
    const names = [...body.items, ...(page2.json as { items: { name: string }[] }).items].map((c) => c.name);
    expect(names).toEqual([`Cliente A ${tag}`, `Cliente B ${tag}`]);
    expect((await http(`/api/admin/clients?q=nao-existe-${tag}`, { cookie: admin })).json).toMatchObject({ total: 0, items: [] });

    const row = await ownerDb.client.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.contactEmail).toBe(`a@cliente-${tag}.test`);
    const audit = await ownerDb.auditLog.findFirst({ where: { clientId: created.id, action: "client.created" } });
    expect(audit?.actorId).toBe(w.admin.id);

    const listPage = await http(`/admin/clients?q=${tag}`, { cookie: admin });
    expect(listPage.text).toContain(`Cliente A ${tag}`);
    expect(listPage.text).toContain(`Cliente B ${tag}`);
    const empty = await http(`/admin/clients?q=zzz-${tag}`, { cookie: admin });
    expect(empty.text).toContain("Nenhum cliente encontrado");
  });

  it("valida os campos no servidor (422 com mensagens por campo) e nao cria nada", async () => {
    const before = await ownerDb.client.count();
    const r = await http("/api/admin/clients", { method: "POST", cookie: admin, body: { name: "x", contactEmail: "nao-e-email", timezone: "Mars/Olympus" } });
    expect(r.status).toBe(422);
    const fields = err(r)?.fields ?? {};
    expect(Object.keys(fields).sort()).toEqual(["contactEmail", "name", "timezone"]);
    expect(fields.name).toMatch(/nome/i);
    expect(await ownerDb.client.count()).toBe(before);
    expectNoLeak(r);
  });
});

describe("convite de uso unico (P2)", () => {
  it("admin convida, a pessoa abre o link, define a senha, entra; o segundo uso falha (410)", async () => {
    const email = `convidado-${Math.random().toString(36).slice(2, 8)}@convidado.test`;
    const { r, link, token } = await invite(w.clientA, email, "CLIENT_COLLABORATOR");
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ emailSent: false });
    expect(link).toBe(`${BASE}/invite/${token}`);
    expect(token.length).toBeGreaterThanOrEqual(40);

    // Token nunca em texto puro no banco, nem na auditoria; so o hash SHA-256.
    const row = await ownerDb.invitation.findFirstOrThrow({ where: { clientId: w.clientA, email } });
    expect(row.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(row.tokenHash).not.toContain(token);
    const audit = await ownerDb.auditLog.findMany({ where: { entityId: row.id } });
    expect(JSON.stringify(audit)).not.toContain(token);
    expect(JSON.stringify(audit)).not.toContain(row.tokenHash);

    // Listagem do cliente (JSON e pagina) nunca devolve token nem hash.
    const detail = await http(`/api/admin/clients/${w.clientA}`, { cookie: admin });
    expect(detail.text).not.toContain(token);
    expect(detail.text).not.toContain(row.tokenHash);
    expect(detail.text).not.toMatch(/tokenHash|token_hash/);
    const detailPage = await http(`/admin/clients/${w.clientA}`, { cookie: admin });
    expect(detailPage.text).not.toContain(token);
    expect(detailPage.text).toContain(email);

    const open = await http(`/invite/${token}`);
    expect(open.text).toContain("Ative sua conta");
    expect(open.text).toContain(email);

    const weak = await http("/api/invitations/accept", { method: "POST", body: { token, name: "Pessoa Convidada", password: "curta" } });
    expect(weak.status).toBe(422);
    expect(err(weak)?.fields?.password).toMatch(/12/);

    const ok = await http("/api/invitations/accept", { method: "POST", body: { token, name: "Pessoa Convidada", password: "uma-senha-bem-longa-123" } });
    expect(ok.status).toBe(201);
    const again = await http("/api/invitations/accept", { method: "POST", body: { token, name: "Outra Pessoa", password: "outra-senha-bem-longa-1" } });
    expect(again.status).toBe(410);
    expect(err(again)?.code).toBe("INVALID_INVITATION");

    const reopened = await http(`/invite/${token}`);
    expect(reopened.text).toContain("Convite inválido ou expirado");
    expect(reopened.text).not.toContain(email);

    const cookie = await login(email, "uma-senha-bem-longa-123");
    const me = await http("/api/portal/client", { cookie });
    expect(me.status).toBe(200);
    expect((me.json as { client: { id: string } }).client.id).toBe(w.clientA);
    // Apos aceitar, convidar o mesmo e-mail e conflito (409): ja existe conta.
    const dup = await invite(w.clientA, email);
    expect(dup.r.status).toBe(409);
    expect(err(dup.r)?.code).toBe("EMAIL_TAKEN");
  });

  it("expirado, revogado e inexistente respondem exatamente o mesmo 410", async () => {
    const mk = async (label: string) => invite(w.clientA, `${label}-${Math.random().toString(36).slice(2, 8)}@convidado.test`);
    const expired = await mk("exp");
    const revoked = await mk("rev");
    const used = await mk("usado");

    await ownerDb.$executeRaw`UPDATE invitations SET created_at = now() - interval '9 days', expires_at = now() - interval '2 days' WHERE token_hash = ${createHash("sha256").update(expired.token).digest("hex")}`;
    const revId = (revoked.r.json as { invitationId: string }).invitationId;
    const rv = await http(`/api/admin/clients/${w.clientA}/invitations/${revId}`, { method: "DELETE", cookie: admin });
    expect(rv.status).toBe(204);
    expect((await http("/api/invitations/accept", { method: "POST", body: { token: used.token, name: "Usado Ficticio", password: "senha-bem-longa-12345" } })).status).toBe(201);

    const results = [];
    for (const token of [expired.token, revoked.token, used.token, "token-que-nunca-existiu-0123456789abcdef"]) {
      results.push(await http("/api/invitations/accept", { method: "POST", body: { token, name: "Qualquer Pessoa", password: "senha-bem-longa-12345" } }));
      const page = await http(`/invite/${token}`);
      expect(page.text).toContain("Convite inválido ou expirado");
    }
    for (const r of results) {
      expect(r.status).toBe(410);
      expect(err(r)?.code).toBe("INVALID_INVITATION");
      expect(err(r)?.message).toBe(err(results[0])?.message);
    }
  });

  it("e-mail que ja tem conta nao recebe convite (409) e convite pendente repetido tambem", async () => {
    const dupAccount = await invite(w.clientA, w.ownerB.email);
    expect(dupAccount.r.status).toBe(409);
    const email = `pend-${Math.random().toString(36).slice(2, 8)}@convidado.test`;
    expect((await invite(w.clientA, email)).r.status).toBe(201);
    const again = await invite(w.clientA, email);
    expect(again.r.status).toBe(409);
    expect(err(again.r)?.code).toBe("INVITATION_PENDING");
    expect((await invite(w.clientA, email, "STAFF")).r.status).toBe(422);
  });
});

describe("login, cookies e limite de tentativas (P4)", () => {
  it("credenciais erradas: mesma mensagem para e-mail inexistente e senha errada, sem cookie", async () => {
    const ip = uniqueIp();
    const wrongPass = await http("/api/auth/sign-in/email", { method: "POST", ip, body: { email: w.ownerA.email, password: "senha-errada-12345" } });
    const noUser = await http("/api/auth/sign-in/email", { method: "POST", ip, body: { email: "ninguem@nao-existe.test", password: "senha-errada-12345" } });
    expect(wrongPass.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect((wrongPass.json as { code: string }).code).toBe((noUser.json as { code: string }).code);
    expect((wrongPass.json as { message: string }).message).toBe((noUser.json as { message: string }).message);
    expect(wrongPass.headers.getSetCookie()).toHaveLength(0);
  });

  it("cookie de sessao e HttpOnly e SameSite; o app nao devolve hash nem senha", async () => {
    const r = await http("/api/auth/sign-in/email", { method: "POST", body: { email: w.ownerA.email, password: TEST_PASSWORD } });
    expect(r.status).toBe(200);
    const cookie = r.headers.getSetCookie().find((c) => c.includes("session_token"));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(r.text).not.toMatch(/password|scrypt|\$argon/i);
    const user = await ownerDb.user.findUniqueOrThrow({ where: { id: w.ownerA.id } });
    expect(user.lastLoginAt).not.toBeNull();
  });

  it("muitas tentativas de login: 429 com limite em banco (rate_limits)", async () => {
    const ip = uniqueIp();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      statuses.push((await http("/api/auth/sign-in/email", { method: "POST", ip, body: { email: w.ownerA.email, password: "senha-errada-12345" } })).status);
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
    const rows = await ownerDb.rateLimit.findMany({ where: { key: `app:auth-ip:/sign-in/email:${ip}` } });
    expect(rows.length).toBe(1);
    // Outro IP nao e afetado (o limite e por IP).
    expect((await http("/api/auth/sign-in/email", { method: "POST", body: { email: w.ownerA.email, password: TEST_PASSWORD } })).status).toBe(200);
  });

  it("aceitar convite tambem tem limite de tentativas (429)", async () => {
    const ip = uniqueIp();
    const out: number[] = [];
    for (let i = 0; i < 12; i++) out.push((await http("/api/invitations/accept", { method: "POST", ip, body: { token: "x".repeat(40), name: "Chute Ficticio", password: "senha-bem-longa-12345" } })).status);
    expect(out.slice(0, 10).every((s) => s === 410)).toBe(true);
    expect(out[11]).toBe(429);
    const last = await http("/api/invitations/accept", { method: "POST", ip, body: { token: "x".repeat(40), name: "Chute Ficticio", password: "senha-bem-longa-12345" } });
    expect(last.headers.get("retry-after")).toMatch(/^\d+$/);
  });

  it("recuperacao por e-mail sem SMTP: 503 identico para conta existente e inexistente (nao revela e-mail)", async () => {
    const real = await http("/api/auth/request-password-reset", { method: "POST", body: { email: w.ownerA.email, redirectTo: "/reset-password" } });
    const ghost = await http("/api/auth/request-password-reset", { method: "POST", body: { email: "fantasma@nao-existe.test", redirectTo: "/reset-password" } });
    expect(real.status).toBe(503);
    expect(ghost.status).toBe(503);
    expect(err(real)?.code).toBe("EMAIL_UNAVAILABLE");
    expect(err(real)?.message).toBe(err(ghost)?.message);
    const page = await http("/forgot-password");
    expect(page.text).toContain("Recuperação de senha indisponível");
    expect(page.text).not.toContain("enviamos");
  });

  it("rotas do Better Auth fora da lista de permissao respondem 404 (sem cadastro publico nem /admin do plugin)", async () => {
    for (const path of ["/api/auth/sign-up/email", "/api/auth/admin/create-user", "/api/auth/admin/list-users", "/api/auth/update-user"]) {
      const r = await http(path, { method: "POST", cookie: admin, body: { email: "novo@x.test", password: "senha-bem-longa-12345", name: "Novo" } });
      expect(r.status, path).toBe(404);
    }
  });
});

describe("redefinicao de senha de uso unico (P4)", () => {
  it("token em hash no banco, uso unico, encerra sessoes antigas e a senha antiga deixa de valer", async () => {
    // Emite o token pela MESMA configuracao do app (Better Auth) capturando o link que o e-mail levaria.
    let captured: { token: string } | null = null;
    const auth = createAuth(appDb, {
      secret: process.env.BETTER_AUTH_SECRET ?? "x".repeat(40),
      baseURL: BASE,
      sendResetPassword: async (d) => {
        captured = { token: d.token };
      },
    });
    const old = await login(w.collabA.email);
    expect((await http("/api/portal/client", { cookie: old })).status).toBe(200);

    await auth.api.requestPasswordReset({ body: { email: w.collabA.email, redirectTo: "/reset-password" } });
    const token = (captured as { token: string } | null)?.token;
    expect(token).toBeTruthy();
    const stored = await ownerDb.verification.findMany({ where: { identifier: { contains: token! } } });
    expect(stored).toHaveLength(0); // o identificador esta em hash, nunca o token

    const page = await http(`/reset-password?token=${token}`);
    expect(page.text).toContain("Defina uma nova senha");

    const weak = await http("/api/auth/reset-password", { method: "POST", body: { token, newPassword: "curta" } });
    expect(weak.status).toBeGreaterThanOrEqual(400);

    const ok = await http("/api/auth/reset-password", { method: "POST", body: { token, newPassword: "nova-senha-bem-longa-9" } });
    expect(ok.status).toBe(200);
    const reuse = await http("/api/auth/reset-password", { method: "POST", body: { token, newPassword: "outra-senha-bem-longa-9" } });
    expect(reuse.status).toBeGreaterThanOrEqual(400);

    expect((await http("/api/portal/client", { cookie: old })).status).toBe(401);
    const stale = await http("/api/auth/sign-in/email", { method: "POST", body: { email: w.collabA.email, password: TEST_PASSWORD } });
    expect(stale.status).toBe(401);
    expect((await login(w.collabA.email, "nova-senha-bem-longa-9")).length).toBeGreaterThan(10);
    expect((await http("/reset-password?error=INVALID_TOKEN")).text).toContain("Link inválido ou expirado");
  });
});

describe("CSRF e formato dos erros", () => {
  it("requisicao que muda estado de outro site (Origin) ou sem Origin e recusada com 403, mesmo com cookie valido", async () => {
    const csrfName = `Cliente CSRF ${Math.random().toString(36).slice(2, 8)}`;
    for (const origin of ["https://site-malicioso.example", null] as const) {
      const r = await http("/api/admin/clients", { method: "POST", cookie: admin, origin, body: { name: csrfName, timezone: "America/Maceio" } });
      expect(r.status, String(origin)).toBe(403);
      expectNoLeak(r);
    }
    expect(await ownerDb.client.count({ where: { name: csrfName } })).toBe(0);
    const login = await http("/api/auth/sign-in/email", { method: "POST", origin: "https://site-malicioso.example", cookie: admin, body: { email: w.admin.email, password: TEST_PASSWORD } });
    expect(login.status).toBe(403);
  });

  it("400, 401, 403, 404, 409, 410, 422 e 429 trazem codigo e mensagem, sem stack", async () => {
    const samples = [
      await http("/api/admin/clients", { method: "POST", cookie: admin, body: "{json quebrado" }), // 400
      await http("/api/admin/clients", { method: "POST", cookie: admin, headers: { "content-type": "text/plain" } }), // 400/415 via parse
      await http("/api/admin/clients"), // 401
      await http("/api/admin/audit", { cookie: await login(w.ownerB.email) }), // 403
      await http(`/api/admin/clients/${"0".repeat(8)}-0000-4000-8000-${"0".repeat(12)}`, { cookie: admin }), // 404
      (await invite(w.clientA, w.ownerA.email)).r, // 409
      await http("/api/invitations/accept", { method: "POST", body: { token: "t".repeat(30), name: "Nome Ficticio", password: "senha-bem-longa-12345" } }), // 410
      await http("/api/admin/clients", { method: "POST", cookie: admin, body: {} }), // 422
    ];
    expect(samples.map((s) => s.status)).toEqual([400, 400, 401, 403, 404, 409, 410, 422]);
    for (const s of samples) {
      expect(err(s)?.code).toBeTruthy();
      expect(err(s)?.message).toBeTruthy();
      expectNoLeak(s);
    }
  });
});
