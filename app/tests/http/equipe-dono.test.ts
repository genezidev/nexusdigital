import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { BASE_MUT, err, expectNoLeak, http, login } from "./helpers/http";
import { addMember, makePhase2World, makeUser, ownerDb, type Phase2World } from "./helpers/phase2";

// D-0026 / R-24 por HTTP real: o dono convida e administra colaboradores do PROPRIO cliente. Cinco tipos de pessoa
// (dono, colaborador, STAFF, ADMIN, dono de outro cliente), origem (CSRF), limite por pessoa e o fluxo completo.

let x: Phase2World;
let collabOfA: { id: string; memberId: string; email: string };
let collabOfB: { id: string; memberId: string };
let pendingOfA: string;
let pendingOfB: string;
const mail = (p: string) => `${p}-${randomUUID().slice(0, 8)}@convidado.test`;
const invite = (cookie: string, body: unknown, extra: { base?: string; origin?: string | null } = {}) => http("/api/portal/team/invitations", { method: "POST", cookie, body, ...extra });

beforeAll(async () => {
  x = await makePhase2World();
  const c = await makeUser("USER", "colab-equipe");
  collabOfA = { ...c, memberId: (await addMember(x.w.clientA, c.id, "CLIENT_COLLABORATOR")).id };
  const b = await makeUser("USER", "colab-equipe-b");
  collabOfB = { id: b.id, memberId: (await addMember(x.w.clientB, b.id, "CLIENT_COLLABORATOR")).id };
  pendingOfA = ((await invite(x.cookie.ownerA, { email: mail("pend-a") })).json as { invitationId: string }).invitationId;
  pendingOfB = ((await invite(x.cookie.ownerB, { email: mail("pend-b") })).json as { invitationId: string }).invitationId;
});

const snapshot = async (clientId: string) =>
  JSON.stringify({
    members: await ownerDb.clientMember.findMany({ where: { clientId }, orderBy: { id: "asc" }, select: { id: true, role: true, permissions: true, status: true } }),
    invitations: await ownerDb.invitation.findMany({ where: { clientId }, orderBy: { id: "asc" }, select: { id: true, role: true, revokedAt: true, usedAt: true, permissions: true } }),
  });

describe("sem sessao: 401 em todas as rotas da equipe", () => {
  it("leitura, convite, revogacao e alteracao", async () => {
    for (const [m, p, b] of [
      ["GET", "/api/portal/team"],
      ["POST", "/api/portal/team/invitations", { email: mail("x") }],
      ["DELETE", `/api/portal/team/invitations/${pendingOfA}`],
      ["PATCH", `/api/portal/team/members/${collabOfA.memberId}`, { active: false }],
    ] as const) {
      const res = await http(p, { method: m, body: b });
      expect(res.status, `${m} ${p}`).toBe(401);
      expectNoLeak(res);
    }
  });
});

describe("quem nao e dono nao gerencia a equipe (403) e nada muda", () => {
  it("colaborador, colaborador com permissao de aprovar, STAFF atribuida, STAFF livre e ADMIN", async () => {
    const before = [await snapshot(x.w.clientA), await snapshot(x.w.clientB)];
    for (const who of ["collabA", "collabApprover", "staffA", "staffFree", "admin"] as const) {
      for (const [m, p, b] of [
        ["GET", "/api/portal/team", undefined],
        ["POST", "/api/portal/team/invitations", { email: mail("x"), approve: true }],
        ["DELETE", `/api/portal/team/invitations/${pendingOfA}`, undefined],
        ["PATCH", `/api/portal/team/members/${collabOfA.memberId}`, { approve: true }],
        ["PATCH", `/api/portal/team/members/${collabOfA.memberId}`, { active: false }],
      ] as const) {
        const res = await http(p, { method: m, cookie: x.cookie[who], body: b });
        expect(res.status, `${who} ${m} ${p}`).toBe(403);
        expect(err(res)?.code, `${who} ${m} ${p}`).toBe("FORBIDDEN");
        expectNoLeak(res);
      }
    }
    expect([await snapshot(x.w.clientA), await snapshot(x.w.clientB)]).toEqual(before);
  });

  it("a pagina /portal/team mostra 'Acesso negado' ao colaborador e nao traz nenhuma pessoa nem e-mail", async () => {
    const res = await http("/portal/team", { cookie: x.cookie.collabA });
    expect(res.text).toMatch(/acesso negado/i);
    expect(res.text).not.toContain(x.w.ownerA.email);
    expect(res.text).not.toContain(collabOfA.email);
  });
});

describe("dono: leitura da propria equipe", () => {
  it("lista so as pessoas do proprio cliente, sem a equipe da agencia, sem hash e sem dados do outro cliente", async () => {
    const res = await http("/api/portal/team", { cookie: x.cookie.ownerA });
    expect(res.status).toBe(200);
    const body = res.json as { members: { email: string; role: string; manageable: boolean }[]; invitations: { id: string }[] };
    const emails = body.members.map((m) => m.email);
    expect(emails).toEqual(expect.arrayContaining([x.w.ownerA.email, x.w.collabA.email, collabOfA.email]));
    expect(emails).not.toContain(x.w.staffAssignedA.email);
    expect(emails).not.toContain(x.w.ownerB.email);
    expect(body.members.find((m) => m.email === x.w.ownerA.email)?.manageable).toBe(false);
    expect(body.members.find((m) => m.email === collabOfA.email)?.manageable).toBe(true);
    expect(body.invitations.map((i) => i.id)).toContain(pendingOfA);
    expect(body.invitations.map((i) => i.id)).not.toContain(pendingOfB);
    expect(res.text).not.toMatch(/tokenHash|token_hash/);
    // ?clientId= e ignorado: o cliente vem da sessao
    const forged = await http(`/api/portal/team?clientId=${x.w.clientB}`, { cookie: x.cookie.ownerA });
    expect(forged.text).not.toContain(x.w.ownerB.email);
    expect(forged.text).not.toContain(collabOfB.id);
  });
});

describe("dono: convida, ajusta e desativa colaboradores", () => {
  it("convite devolve o link UMA vez (sem e-mail enviado), de colaborador, do proprio cliente, so com o hash gravado", async () => {
    const e = mail("convidado");
    const res = await invite(x.cookie.ownerA, { email: e.toUpperCase() });
    expect(res.status).toBe(201);
    const out = res.json as { invitationId: string; link: string; expiresAt: string; emailSent: boolean };
    expect(out.emailSent).toBe(false);
    expect(out.link).toMatch(/\/invite\/[A-Za-z0-9_-]{40,}$/);
    const row = await ownerDb.invitation.findUniqueOrThrow({ where: { id: out.invitationId } });
    expect(row).toMatchObject({ clientId: x.w.clientA, role: "CLIENT_COLLABORATOR", invitedById: x.w.ownerA.id, email: e, permissions: [] });
    const token = out.link.split("/invite/")[1];
    expect(row.tokenHash).not.toContain(token);
    const list = await http("/api/portal/team", { cookie: x.cookie.ownerA });
    expect(list.text).not.toContain(token);
  });

  it("fluxo completo: dono convida, a pessoa aceita, entra como colaborador (sem 'Equipe'), com aprovar so se foi marcado", async () => {
    const e = mail("fluxo");
    const out = (await invite(x.cookie.ownerA, { email: e, approve: true })).json as { link: string; invitationId: string };
    const token = out.link.split("/invite/")[1];
    const peek = await http(`/invite/${token}`);
    expect(peek.status).toBe(200);
    const accepted = await http("/api/invitations/accept", { method: "POST", body: { token, name: "Pessoa Convidada", password: "uma-senha-bem-longa-1" } });
    expect(accepted.status).toBe(201);
    const user = await ownerDb.user.findUniqueOrThrow({ where: { email: e } });
    expect(await ownerDb.clientMember.findFirstOrThrow({ where: { userId: user.id } })).toMatchObject({ clientId: x.w.clientA, role: "CLIENT_COLLABORATOR", status: "ACTIVE", permissions: ["content:approve"] });
    const cookie = await login(e, "uma-senha-bem-longa-1");
    expect((await http("/api/portal/context", { cookie })).status).toBe(200);
    expect((await http("/api/portal/team", { cookie })).status).toBe(403);
    expect((await invite(cookie, { email: mail("nao") })).status).toBe(403);
    // o link nao serve duas vezes
    const again = await http("/api/invitations/accept", { method: "POST", body: { token, name: "Outra Pessoa", password: "uma-senha-bem-longa-1" } });
    expect(again.status).toBe(410);
  });

  it("e-mail que ja tem conta: 409 EMAIL_TAKEN com mensagem clara; convite pendente repetido: 409", async () => {
    const dup = await invite(x.cookie.ownerA, { email: x.w.collabA.email });
    expect(dup.status).toBe(409);
    expect(err(dup)?.code).toBe("EMAIL_TAKEN");
    expect(err(dup)?.message).toMatch(/ja tem uma conta/i);
    const e = mail("pendente");
    expect((await invite(x.cookie.ownerA, { email: e })).status).toBe(201);
    const again = await invite(x.cookie.ownerA, { email: e });
    expect(again.status).toBe(409);
    expect(err(again)?.code).toBe("INVITATION_PENDING");
  });

  it("aprovar liga e desliga; desativar tira o acesso na hora e reativar devolve; tudo auditado", async () => {
    const colab = await makeUser("USER", "colab-ciclo");
    const m = await addMember(x.w.clientA, colab.id, "CLIENT_COLLABORATOR");
    const cookie = await login(colab.email);
    const patch = (b: unknown) => http(`/api/portal/team/members/${m.id}`, { method: "PATCH", cookie: x.cookie.ownerA, body: b });
    expect((await patch({ approve: true })).json).toMatchObject({ ok: true, canApprove: true });
    expect((await ownerDb.clientMember.findUniqueOrThrow({ where: { id: m.id } })).permissions).toEqual(["content:approve"]);
    expect((await patch({ approve: false })).status).toBe(200);
    expect((await ownerDb.clientMember.findUniqueOrThrow({ where: { id: m.id } })).permissions).toEqual([]);
    expect((await http("/api/portal/plan", { cookie })).status).toBe(200);
    expect((await patch({ active: false })).status).toBe(200);
    expect((await ownerDb.clientMember.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("REVOKED");
    // acesso tirado na hora: a mesma sessao deixa de funcionar neste cliente
    expect((await http("/api/portal/plan", { cookie })).status).toBeGreaterThanOrEqual(403);
    expect((await patch({ active: true })).status).toBe(200);
    expect((await http("/api/portal/plan", { cookie })).status).toBe(200);
    const actions = (await ownerDb.auditLog.findMany({ where: { entityId: m.id, actorId: x.w.ownerA.id } })).map((a) => a.action).sort();
    expect(actions).toEqual(["team.member_deactivated", "team.member_reactivated", "team.permissions_changed", "team.permissions_changed"]);
  });

  it("revoga convite pendente de colaborador; a segunda revogacao e 404", async () => {
    const created = (await invite(x.cookie.ownerA, { email: mail("revogar") })).json as { invitationId: string; link: string };
    const del = await http(`/api/portal/team/invitations/${created.invitationId}`, { method: "DELETE", cookie: x.cookie.ownerA });
    expect(del.status).toBe(200);
    expect((await ownerDb.invitation.findUniqueOrThrow({ where: { id: created.invitationId } })).revokedAt).not.toBeNull();
    expect((await http(`/api/portal/team/invitations/${created.invitationId}`, { method: "DELETE", cookie: x.cookie.ownerA })).status).toBe(404);
    // o link revogado nao aceita mais
    const token = created.link.split("/invite/")[1];
    expect((await http("/api/invitations/accept", { method: "POST", body: { token, name: "Pessoa Ficticia", password: "uma-senha-bem-longa-1" } })).status).toBe(410);
  });
});

describe("limites do dono: so colaborador, so o proprio cliente, nunca ele mesmo", () => {
  it("nao convida OWNER nem STAFF nem escolhe cliente: campos extras viram 422 e nada e gravado", async () => {
    const before = await snapshot(x.w.clientA);
    for (const extra of [{ role: "CLIENT_OWNER" }, { role: "STAFF" }, { role: "CLIENT_COLLABORATOR" }, { clientId: x.w.clientB }, { permissions: ["content:write"] }, { invitedById: x.w.admin.id }, { approve: "sim" }]) {
      const res = await invite(x.cookie.ownerA, { email: mail("x"), ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(422);
    }
    expect((await invite(x.cookie.ownerA, { email: "nao-e-email" })).status).toBe(422);
    expect((await invite(x.cookie.ownerA, {})).status).toBe(422);
    expect(await snapshot(x.w.clientA)).toBe(before);
    expect(await ownerDb.invitation.count({ where: { clientId: x.w.clientB, email: { contains: "convidado.test" }, role: "CLIENT_OWNER" } })).toBe(0);
  });

  it("nao mexe em si mesmo (409), em outro dono, na STAFF atribuida (403), e o corpo precisa de exatamente uma mudanca (422)", async () => {
    const own = await ownerDb.clientMember.findFirstOrThrow({ where: { clientId: x.w.clientA, userId: x.w.ownerA.id } });
    const staff = await ownerDb.clientMember.findFirstOrThrow({ where: { clientId: x.w.clientA, userId: x.w.staffAssignedA.id } });
    const owner2 = await makeUser("USER", "dono-dois");
    const m2 = await addMember(x.w.clientA, owner2.id, "CLIENT_OWNER");
    const patch = (id: string, b: unknown) => http(`/api/portal/team/members/${id}`, { method: "PATCH", cookie: x.cookie.ownerA, body: b });
    for (const b of [{ active: false }, { approve: false }]) {
      const self = await patch(own.id, b);
      expect(self.status).toBe(409);
      expect(err(self)?.code).toBe("SELF_MANAGE");
      expect((await patch(m2.id, b)).status).toBe(403);
      expect((await patch(staff.id, b)).status).toBe(403);
    }
    expect((await patch(collabOfA.memberId, {})).status).toBe(422);
    expect((await patch(collabOfA.memberId, { approve: true, active: false })).status).toBe(422);
    for (const extra of [{ role: "CLIENT_OWNER" }, { permissions: ["content:write"] }, { userId: x.w.ownerB.id }, { clientId: x.w.clientB }]) {
      expect((await patch(collabOfA.memberId, { approve: true, ...extra })).status, JSON.stringify(extra)).toBe(422);
    }
    for (const id of [own.id, staff.id, m2.id]) {
      const row = await ownerDb.clientMember.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe("ACTIVE");
      expect(row.permissions).toEqual([]);
    }
    expect((await ownerDb.clientMember.findUniqueOrThrow({ where: { id: own.id } })).role).toBe("CLIENT_OWNER");
  });

  it("dono de B com ids de A (e o inverso): 404, sem pista, e o outro cliente nao muda", async () => {
    const before = [await snapshot(x.w.clientA), await snapshot(x.w.clientB)];
    for (const [cookie, member, pending] of [
      [x.cookie.ownerB, collabOfA.memberId, pendingOfA],
      [x.cookie.ownerA, collabOfB.memberId, pendingOfB],
    ] as const) {
      for (const b of [{ approve: true }, { active: false }]) {
        const res = await http(`/api/portal/team/members/${member}`, { method: "PATCH", cookie, body: b });
        expect(res.status).toBe(404);
        expectNoLeak(res);
      }
      const del = await http(`/api/portal/team/invitations/${pending}`, { method: "DELETE", cookie });
      expect(del.status).toBe(404);
    }
    for (const bad of ["nao-e-uuid", randomUUID(), "%00", "..%2f"]) {
      expect((await http(`/api/portal/team/members/${bad}`, { method: "PATCH", cookie: x.cookie.ownerA, body: { active: false } })).status, bad).toBe(404);
      expect((await http(`/api/portal/team/invitations/${bad}`, { method: "DELETE", cookie: x.cookie.ownerA })).status, bad).toBe(404);
    }
    expect([await snapshot(x.w.clientA), await snapshot(x.w.clientB)]).toEqual(before);
  });

  it("o dono de B convida: o convite nasce no B, nunca no A", async () => {
    const e = mail("do-b");
    const res = await invite(x.cookie.ownerB, { email: e });
    expect(res.status).toBe(201);
    expect((await ownerDb.invitation.findFirstOrThrow({ where: { email: e } })).clientId).toBe(x.w.clientB);
  });
});

describe("origem (CSRF)", () => {
  it("POST, PATCH e DELETE de outra origem ou sem Origin sao recusados e nada muda", async () => {
    const before = await snapshot(x.w.clientA);
    for (const origin of ["https://evil.example", null] as const) {
      expect((await invite(x.cookie.ownerA, { email: mail("csrf") }, { origin })).status, String(origin)).toBe(403);
      expect((await http(`/api/portal/team/members/${collabOfA.memberId}`, { method: "PATCH", cookie: x.cookie.ownerA, origin, body: { active: false } })).status).toBe(403);
      expect((await http(`/api/portal/team/invitations/${pendingOfA}`, { method: "DELETE", cookie: x.cookie.ownerA, origin })).status).toBe(403);
    }
    expect(await snapshot(x.w.clientA)).toBe(before);
  });
});

describe("limite por pessoa (instancia com 3 por 10 minutos)", () => {
  it("o 4o pedido do mesmo dono recebe 429 com Retry-After e nada e gravado; outro dono tem balde proprio", async () => {
    const o1 = await makeUser("USER", "dono-limite-1");
    await addMember(x.w.clientA, o1.id, "CLIENT_OWNER");
    const o2 = await makeUser("USER", "dono-limite-2");
    await addMember(x.w.clientA, o2.id, "CLIENT_OWNER");
    const c1 = await login(o1.email);
    for (let i = 0; i < 3; i++) expect((await invite(c1, { email: mail("lim") }, { base: BASE_MUT })).status).toBe(201);
    const count = await ownerDb.invitation.count({ where: { invitedById: o1.id } });
    const blocked = await invite(c1, { email: mail("lim") }, { base: BASE_MUT });
    expect(blocked.status).toBe(429);
    expect(err(blocked)?.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await ownerDb.invitation.count({ where: { invitedById: o1.id } })).toBe(count);
    expect((await http("/api/portal/team/members/" + collabOfA.memberId, { method: "PATCH", cookie: c1, base: BASE_MUT, body: { approve: true } })).status).toBe(429);
    expect((await invite(await login(o2.email), { email: mail("lim2") }, { base: BASE_MUT })).status).toBe(201);
  });
});
