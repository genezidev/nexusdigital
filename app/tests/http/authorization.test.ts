import { beforeAll, describe, expect, it } from "vitest";
import { ownerDb, makeWorld, type World } from "../integration/helpers/world";
import { err, expectNoLeak, http, login, uniqueIp } from "./helpers/http";

// IDOR/BOLA por HTTP real: o app compilado, o banco nexo_test, cookies de sessao de verdade.
// Dados do Cliente B jamais podem aparecer para quem e do Cliente A, e o que nao e admin nao entra em /admin.

let w: World;
let cookies: Record<"admin" | "ownerA" | "collabA" | "ownerB" | "staffA" | "staffFree", string>;

beforeAll(async () => {
  w = await makeWorld();
  cookies = {
    admin: await login(w.admin.email),
    ownerA: await login(w.ownerA.email),
    collabA: await login(w.collabA.email),
    ownerB: await login(w.ownerB.email),
    staffA: await login(w.staffAssignedA.email),
    staffFree: await login(w.staffUnassigned.email),
  };
});

describe("sem sessao", () => {
  it("API protegida responde 401 sem stack", async () => {
    for (const path of ["/api/admin/clients", `/api/admin/clients/${w.clientA}`, "/api/admin/audit", "/api/portal/client", "/api/portal/context"]) {
      const r = await http(path);
      expect(r.status, path).toBe(401);
      expect(err(r)?.code).toBe("UNAUTHORIZED");
      expectNoLeak(r);
    }
  });

  it("paginas protegidas redirecionam para o login (primeira barreira) e guardam so o caminho interno", async () => {
    for (const path of ["/admin", "/admin/clients", `/admin/clients/${w.clientB}`, "/portal"]) {
      const r = await http(path);
      expect([302, 303, 307, 308]).toContain(r.status);
      const location = r.headers.get("location") ?? "";
      expect(new URL(location, "http://x").pathname).toBe("/login");
    }
  });
});

describe("usuario do Cliente A nao alcanca a administracao nem o Cliente B (R-1, R-2)", () => {
  it("todas as rotas /api/admin respondem 403, inclusive com o id do cliente B", async () => {
    const attempts: [string, string, unknown?][] = [
      ["GET", "/api/admin/clients"],
      ["GET", `/api/admin/clients/${w.clientA}`],
      ["GET", `/api/admin/clients/${w.clientB}`],
      ["GET", "/api/admin/audit"],
      ["POST", "/api/admin/clients", { name: "Invasor", timezone: "America/Maceio" }],
      ["POST", `/api/admin/clients/${w.clientB}/invitations`, { email: "x@invasor.test", role: "CLIENT_OWNER" }],
      ["POST", `/api/admin/clients/${w.clientA}/invitations`, { email: "y@invasor.test", role: "CLIENT_OWNER" }],
      ["DELETE", `/api/admin/clients/${w.clientB}/invitations/${w.invitationB}`],
      ["PUT", `/api/admin/clients/${w.clientB}/members/${w.memberOwnerB}/blocked`, { blocked: true }],
      ["DELETE", `/api/admin/clients/${w.clientB}/members/${w.memberOwnerB}/sessions`],
    ];
    for (const who of ["ownerA", "collabA"] as const) {
      for (const [method, path, body] of attempts) {
        const r = await http(path, { method, cookie: cookies[who], body });
        expect(r.status, `${who} ${method} ${path}`).toBe(403);
        expect(err(r)?.code).toBe("FORBIDDEN");
        expectNoLeak(r);
        expect(r.text).not.toContain(w.clientB);
        expect(r.text).not.toContain(w.ownerB.email);
      }
    }
  });

  it("nada do Cliente B foi alterado pelas tentativas", async () => {
    const inv = await ownerDb.invitation.findUniqueOrThrow({ where: { id: w.invitationB } });
    expect(inv.revokedAt).toBeNull();
    const ownerB = await ownerDb.user.findUniqueOrThrow({ where: { id: w.ownerB.id } });
    expect(ownerB.banned).toBe(false);
    expect(await ownerDb.session.count({ where: { userId: w.ownerB.id } })).toBeGreaterThan(0);
    expect(await ownerDb.client.count({ where: { name: "Invasor" } })).toBe(0);
  });

  it("paginas /admin mostram 'Acesso negado' e nenhum dado de cliente", async () => {
    for (const path of ["/admin", "/admin/clients", `/admin/clients/${w.clientA}`, `/admin/clients/${w.clientB}`, "/admin/audit", "/admin/profile"]) {
      const r = await http(path, { cookie: cookies.ownerA });
      expect(r.text, path).toContain("Acesso negado");
      expect(r.text).not.toContain(w.ownerB.email);
      // O id so aparece se a PROPRIA pessoa o digitou na URL (eco do pedido); nunca como dado vindo do banco.
      if (!path.includes(w.clientB)) expect(r.text).not.toContain(w.clientB);
      expect(r.text).not.toContain("Cliente B");
      expect(r.text).not.toMatch(/at\s+\S+\s+\(|node_modules/);
    }
  });

  it("a area do portal ignora clientId da URL e mostra so o cliente da sessao", async () => {
    const own = await http(`/api/portal/client?clientId=${w.clientB}`, { cookie: cookies.ownerA });
    expect(own.status).toBe(200);
    const body = own.json as { client: { id: string; name: string }; team: { email: string }[] };
    expect(body.client.id).toBe(w.clientA);
    expect(own.text).not.toContain(w.clientB);
    expect(own.text).not.toContain(w.ownerB.email);
    expect(body.team.map((m) => m.email)).toContain(w.ownerA.email);

    const page = await http(`/portal?clientId=${w.clientB}`, { cookie: cookies.ownerA });
    expect(page.status).toBe(200);
    expect(page.text).toContain("Cliente A");
    expect(page.text).not.toContain(w.ownerB.email);

    const ctx = await http("/api/portal/context", { cookie: cookies.ownerA });
    expect((ctx.json as { clients: { id: string }[] }).clients.map((c) => c.id)).toEqual([w.clientA]);
  });

  it("trocar para o cliente B (onde nao participa) e negado e o cliente ativo nao muda", async () => {
    const r = await http("/api/portal/context", { method: "POST", cookie: cookies.ownerA, body: { clientId: w.clientB } });
    expect(r.status).toBe(403);
    expectNoLeak(r);
    const session = await ownerDb.session.findFirstOrThrow({ where: { userId: w.ownerA.id }, orderBy: { createdAt: "desc" } });
    expect(session.activeClientId).toBe(w.clientA);
    const bad = await http("/api/portal/context", { method: "POST", cookie: cookies.ownerA, body: { clientId: "nao-e-uuid" } });
    expect(bad.status).toBe(422);
  });

  it("colaborador (so le) e dono veem o portal; admin e staff sao levados ao /admin", async () => {
    expect((await http("/api/portal/client", { cookie: cookies.collabA })).status).toBe(200);
    expect((await http("/api/portal/client", { cookie: cookies.admin })).status).toBe(403);
    // A pagina ja comecou a transmitir (Cache Components): o redirecionamento viaja no corpo, sem conteudo do portal.
    const r = await http("/portal", { cookie: cookies.admin });
    expect(r.text).toMatch(/NEXT_REDIRECT;\w+;\/admin/);
    expect(r.text).not.toContain("Seu cliente");
  });
});

describe("STAFF so enxerga clientes atribuidos e nao administra", () => {
  it("staff atribuido ao A lista so o A, abre o A e recebe 404 no B", async () => {
    const list = await http("/api/admin/clients", { cookie: cookies.staffA });
    expect(list.status).toBe(200);
    const ids = (list.json as { items: { id: string }[] }).items.map((c) => c.id);
    expect(ids).toContain(w.clientA);
    expect(ids).not.toContain(w.clientB);

    expect((await http(`/api/admin/clients/${w.clientA}`, { cookie: cookies.staffA })).status).toBe(200);
    const b = await http(`/api/admin/clients/${w.clientB}`, { cookie: cookies.staffA });
    expect(b.status).toBe(404);
    expect(b.text).not.toContain(w.ownerB.email);
    // O 404 e identico ao de um cliente que nao existe: nao revela existencia.
    const ghost = await http(`/api/admin/clients/00000000-0000-4000-8000-000000000000`, { cookie: cookies.staffA });
    expect(ghost.status).toBe(404);
    expect(err(ghost)?.message).toBe(err(b)?.message);
  });

  it("staff sem atribuicao nao abre nenhum cliente e a lista vem vazia", async () => {
    for (const id of [w.clientA, w.clientB]) {
      expect((await http(`/api/admin/clients/${id}`, { cookie: cookies.staffFree })).status).toBe(404);
    }
    const list = await http("/api/admin/clients", { cookie: cookies.staffFree });
    expect((list.json as { total: number }).total).toBe(0);
    const page = await http(`/admin/clients/${w.clientA}`, { cookie: cookies.staffFree });
    expect(page.text).toContain("Página não encontrada");
    expect(page.text).not.toContain(w.ownerA.email);
  });

  it("staff nao cria cliente, nao convida, nao bloqueia e nao le a auditoria global", async () => {
    const attempts: [string, string, unknown?][] = [
      ["POST", "/api/admin/clients", { name: "Staff cria", timezone: "America/Maceio" }],
      ["POST", `/api/admin/clients/${w.clientA}/invitations`, { email: "s@staff.test", role: "CLIENT_OWNER" }],
      ["PUT", `/api/admin/clients/${w.clientA}/members/${w.memberOwnerA}/blocked`, { blocked: true }],
      ["DELETE", `/api/admin/clients/${w.clientA}/members/${w.memberOwnerA}/sessions`],
      ["GET", "/api/admin/audit"],
    ];
    for (const [method, path, body] of attempts) {
      const r = await http(path, { method, cookie: cookies.staffA, body });
      expect(r.status, `${method} ${path}`).toBe(403);
    }
    expect((await ownerDb.user.findUniqueOrThrow({ where: { id: w.ownerA.id } })).banned).toBe(false);
    const page = await http("/admin/audit", { cookie: cookies.staffA });
    expect(page.text).toContain("Acesso negado");
  });
});

describe("admin: id de outro cliente nunca casa (404) e nao altera nada", () => {
  it("membro e convite do B usados na rota do A respondem 404", async () => {
    const block = await http(`/api/admin/clients/${w.clientA}/members/${w.memberOwnerB}/blocked`, { method: "PUT", cookie: cookies.admin, body: { blocked: true } });
    expect(block.status).toBe(404);
    const sessions = await http(`/api/admin/clients/${w.clientA}/members/${w.memberOwnerB}/sessions`, { method: "DELETE", cookie: cookies.admin });
    expect(sessions.status).toBe(404);
    const revoke = await http(`/api/admin/clients/${w.clientA}/invitations/${w.invitationB}`, { method: "DELETE", cookie: cookies.admin });
    expect(revoke.status).toBe(404);
    expect((await ownerDb.user.findUniqueOrThrow({ where: { id: w.ownerB.id } })).banned).toBe(false);
    expect((await ownerDb.invitation.findUniqueOrThrow({ where: { id: w.invitationB } })).revokedAt).toBeNull();
    expect(await ownerDb.session.count({ where: { userId: w.ownerB.id } })).toBeGreaterThan(0);
  });

  it("ids malformados viram 404/422 sem vazar erro de banco", async () => {
    for (const path of ["/api/admin/clients/abc", "/api/admin/clients/1%27%20OR%201=1--", `/api/admin/clients/${w.clientA}/members/zzz/blocked`]) {
      const r = await http(path, { method: path.endsWith("blocked") ? "PUT" : "GET", cookie: cookies.admin, body: path.endsWith("blocked") ? { blocked: true } : undefined });
      expect([404, 422]).toContain(r.status);
      expectNoLeak(r);
    }
  });
});

describe("sessao revogada, conta bloqueada e acesso retirado perdem acesso na requisicao seguinte", () => {
  it("sessao apagada no banco: a proxima requisicao e 401", async () => {
    const c = await login(w.collabA.email);
    expect((await http("/api/portal/client", { cookie: c })).status).toBe(200);
    await ownerDb.session.deleteMany({ where: { userId: w.collabA.id } });
    const r = await http("/api/portal/client", { cookie: c });
    expect(r.status).toBe(401);
    const page = await http("/portal", { cookie: c });
    expect(page.text).not.toContain("Cliente A");
  });

  it("admin encerra as sessoes pela API: a pessoa cai na requisicao seguinte e pode entrar de novo", async () => {
    const c = await login(w.ownerA.email);
    expect((await http("/api/portal/client", { cookie: c })).status).toBe(200);
    const r = await http(`/api/admin/clients/${w.clientA}/members/${w.memberOwnerA}/sessions`, { method: "DELETE", cookie: cookies.admin });
    expect(r.status).toBe(200);
    expect((await http("/api/portal/client", { cookie: c })).status).toBe(401);
    expect((await login(w.ownerA.email)).length).toBeGreaterThan(10);
  });

  it("admin bloqueia a conta: sessao cai, login e negado; ao desbloquear volta", async () => {
    const c = await login(w.ownerA.email);
    const blocked = await http(`/api/admin/clients/${w.clientA}/members/${w.memberOwnerA}/blocked`, { method: "PUT", cookie: cookies.admin, body: { blocked: true } });
    expect(blocked.status).toBe(200);
    expect((await http("/api/portal/client", { cookie: c })).status).toBe(401);
    const denied = await http("/api/auth/sign-in/email", { method: "POST", body: { email: w.ownerA.email, password: "senha-de-teste-123456" } });
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(denied.headers.getSetCookie().join(";")).not.toContain("session_token=");
    const unblocked = await http(`/api/admin/clients/${w.clientA}/members/${w.memberOwnerA}/blocked`, { method: "PUT", cookie: cookies.admin, body: { blocked: false } });
    expect(unblocked.status).toBe(200);
    expect((await login(w.ownerA.email)).length).toBeGreaterThan(10);
    const audit = await ownerDb.auditLog.findMany({ where: { clientId: w.clientA, action: { in: ["member.blocked", "member.unblocked"] } } });
    expect(audit.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(audit)).not.toMatch(/senha|password|token/i);
  });

  it("conta bloqueada direto no banco tambem perde a sessao ja aberta na requisicao seguinte", async () => {
    const c = await login(w.collabA.email);
    expect((await http("/api/portal/client", { cookie: c })).status).toBe(200);
    await ownerDb.user.update({ where: { id: w.collabA.id }, data: { banned: true } });
    expect((await http("/api/portal/client", { cookie: c })).status).toBe(401);
    expect((await http("/portal", { cookie: c })).text).not.toContain("Cliente A");
    await ownerDb.user.update({ where: { id: w.collabA.id }, data: { banned: false } });
  });

  it("participacao revogada: a sessao existe, mas o acesso ao cliente e negado (403)", async () => {
    const c = await login(w.ownerB.email);
    expect((await http("/api/portal/client", { cookie: c })).status).toBe(200);
    await ownerDb.clientMember.update({ where: { id: w.memberOwnerB }, data: { status: "REVOKED" } });
    const r = await http("/api/portal/client", { cookie: c });
    expect(r.status).toBe(403);
    const page = await http("/portal", { cookie: c });
    expect(page.text).toContain("Você não tem acesso a nenhum cliente");
    await ownerDb.clientMember.update({ where: { id: w.memberOwnerB }, data: { status: "ACTIVE" } });
  });

  it("STAFF desatribuido perde o acesso ao cliente na requisicao seguinte", async () => {
    const member = await ownerDb.clientMember.findFirstOrThrow({ where: { userId: w.staffAssignedA.id, clientId: w.clientA } });
    const c = await login(w.staffAssignedA.email);
    expect((await http(`/api/admin/clients/${w.clientA}`, { cookie: c })).status).toBe(200);
    await ownerDb.clientMember.update({ where: { id: member.id }, data: { status: "REVOKED" } });
    expect((await http(`/api/admin/clients/${w.clientA}`, { cookie: c })).status).toBe(404);
    await ownerDb.clientMember.update({ where: { id: member.id }, data: { status: "ACTIVE" } });
  });
});

describe("usuario com mais de um cliente escolhe o contexto autorizado", () => {
  it("troca de contexto confere a participacao no servidor e o dado do anterior some", async () => {
    // Dono do A tambem participa de um terceiro cliente C (so para este teste).
    const w2 = await makeWorld();
    const multi = w2.ownerA;
    await ownerDb.clientMember.create({ data: { clientId: w2.clientB, userId: multi.id, role: "CLIENT_COLLABORATOR" } });
    const c = await login(multi.email, undefined, uniqueIp());
    // Com dois clientes, o servidor nao escolhe: contexto vazio, o portal pede a escolha.
    const before = await http("/api/portal/client", { cookie: c });
    expect(before.status).toBe(403);
    const picker = await http("/portal", { cookie: c });
    expect(picker.text).toContain("Escolha o cliente");

    const sw = await http("/api/portal/context", { method: "POST", cookie: c, body: { clientId: w2.clientA } });
    expect(sw.status).toBe(204);
    const a = await http("/api/portal/client", { cookie: c });
    expect((a.json as { client: { id: string } }).client.id).toBe(w2.clientA);

    const sw2 = await http("/api/portal/context", { method: "POST", cookie: c, body: { clientId: w2.clientB } });
    expect(sw2.status).toBe(204);
    const b = await http("/api/portal/client", { cookie: c });
    expect((b.json as { client: { id: string } }).client.id).toBe(w2.clientB);
    // Como colaborador no B, a equipe do B nao aparece (so o dono ve) e nada do A vaza.
    expect(b.text).not.toContain(w2.clientA);
    expect(b.text).not.toContain(w2.ownerA.email);
  });
});
