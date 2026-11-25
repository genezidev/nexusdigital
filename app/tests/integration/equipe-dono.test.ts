import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveTenantContext, type TenantContext } from "@/server/authorization/context";
import { withTenant } from "@/server/db/scope";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors";
import { acceptInvitation, createInvitation } from "@/server/services/invitations";
import { inviteCollaborator, loadTeam, revokeTeamInvitation, setCollaboratorActive, setCollaboratorApproval } from "@/server/services/team";
import { appDb, addMember, makeUser, makeWorld, ownerDb, type World } from "./helpers/world";

// D-0026 / R-24: o DONO do cliente convida e administra COLABORADORES do proprio cliente. O banco impoe (gatilhos
// `client_members_admin_only` e `invitations_admin_only`), entao o que importa aqui e SQL direto como nexo_app, que e o
// que um SQL injetado alcancaria; o servico so devolve respostas claras antes de chegar la.

const SENHA = "uma-senha-forte-de-teste-1";
const email = (p: string) => `${p}-${randomUUID().slice(0, 8)}@convidado.test`;
const hex = () => randomBytes(32).toString("hex");

let w: World;
let admin: TenantContext;
let owner: TenantContext;
let owner2: TenantContext;
let collab: TenantContext;
let staff: TenantContext;
let ownerB: TenantContext;
let collab2: { id: string; email: string; memberId: string };
let owner2User: { id: string; email: string; memberId: string };
let collabB: { id: string; memberId: string };

const sql = (ctx: TenantContext, text: string) => withTenant(appDb, ctx, ({ tx }) => tx.$executeRawUnsafe(text));
const member = (clientId: string, userId: string) => ownerDb.clientMember.findFirstOrThrow({ where: { clientId, userId } });
const REFUSED = /membro|convite|admin|row-level|dono/i;

beforeAll(async () => {
  w = await makeWorld();
  const c2 = await makeUser("USER", "colab-2");
  collab2 = { ...c2, memberId: (await addMember(w.clientA, c2.id, "CLIENT_COLLABORATOR")).id };
  const o2 = await makeUser("USER", "dono-2");
  owner2User = { ...o2, memberId: (await addMember(w.clientA, o2.id, "CLIENT_OWNER")).id };
  const cb = await makeUser("USER", "colab-b");
  collabB = { id: cb.id, memberId: (await addMember(w.clientB, cb.id, "CLIENT_COLLABORATOR")).id };
  admin = await resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: w.clientA });
  owner = await resolveTenantContext(appDb, { userId: w.ownerA.id, activeClientId: w.clientA });
  owner2 = await resolveTenantContext(appDb, { userId: o2.id, activeClientId: w.clientA });
  collab = await resolveTenantContext(appDb, { userId: w.collabA.id, activeClientId: w.clientA });
  staff = await resolveTenantContext(appDb, { userId: w.staffAssignedA.id, activeClientId: w.clientA });
  ownerB = await resolveTenantContext(appDb, { userId: w.ownerB.id, activeClientId: w.clientB });
});

const insertInvite = (ctx: TenantContext, extra: { clientId?: string; role?: string; perms?: string; by?: string; expires?: string; usedAt?: boolean } = {}) =>
  sql(
    ctx,
    `INSERT INTO invitations (client_id, email, role, token_hash, expires_at, invited_by_id, permissions, used_at)
     VALUES ('${extra.clientId ?? w.clientA}', '${email("sql")}', '${extra.role ?? "CLIENT_COLLABORATOR"}', '${hex()}',
             now() + interval '${extra.expires ?? "7 days"}', '${extra.by ?? ctx.userId}', ${extra.perms ?? "ARRAY[]::text[]"}, ${extra.usedAt ? "now()" : "NULL"})`,
  );

describe("o dono convida colaborador (servico)", () => {
  it("cria convite so de COLABORADOR, do proprio cliente, com ele como convidante; so o hash e gravado; audita sem token", async () => {
    const now = new Date();
    const e = email("novo");
    const created = await inviteCollaborator(appDb, owner, { email: e.toUpperCase(), approve: false }, now);
    const row = await ownerDb.invitation.findUniqueOrThrow({ where: { id: created.invitationId } });
    expect(row).toMatchObject({ clientId: w.clientA, role: "CLIENT_COLLABORATOR", invitedById: w.ownerA.id, email: e, permissions: [] });
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.tokenHash).not.toContain(created.token);
    expect(row.expiresAt.getTime() - now.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    const audit = await ownerDb.auditLog.findFirstOrThrow({ where: { action: "team.invited", entityId: created.invitationId } });
    expect(audit.actorId).toBe(w.ownerA.id);
    expect(JSON.stringify(audit)).not.toContain(created.token);
    expect(JSON.stringify(audit)).not.toContain(row.tokenHash);
  });

  it("aprovar e opcional e marcado de forma explicita: o convite carrega content:approve so quando pedido", async () => {
    const a = await inviteCollaborator(appDb, owner, { email: email("aprova"), approve: true });
    const b = await inviteCollaborator(appDb, owner, { email: email("so-ve"), approve: false });
    expect((await ownerDb.invitation.findUniqueOrThrow({ where: { id: a.invitationId } })).permissions).toEqual(["content:approve"]);
    expect((await ownerDb.invitation.findUniqueOrThrow({ where: { id: b.invitationId } })).permissions).toEqual([]);
  });

  it("pessoa que ja tem conta: 409 EMAIL_TAKEN com mensagem clara; convite pendente repetido: 409 INVITATION_PENDING", async () => {
    const existing = await makeUser("USER", "ja-tem-conta");
    const err = await inviteCollaborator(appDb, owner, { email: existing.email, approve: false }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err).toMatchObject({ status: 409, code: "EMAIL_TAKEN" });
    expect(err.message).toMatch(/ja tem uma conta/i);
    const e = email("dup");
    await inviteCollaborator(appDb, owner, { email: e, approve: false });
    await expect(inviteCollaborator(appDb, owner, { email: e, approve: false })).rejects.toMatchObject({ status: 409, code: "INVITATION_PENDING" });
  });

  it("quem aceita vira COLABORADOR ativo do cliente do convite, com as permissoes do convite (e so elas)", async () => {
    const a = await inviteCollaborator(appDb, owner, { email: email("aceita-aprova"), approve: true });
    const r = await acceptInvitation(appDb, { token: a.token, name: "Pessoa Ficticia", password: SENHA });
    expect(r.clientId).toBe(w.clientA);
    expect(await member(w.clientA, r.userId)).toMatchObject({ role: "CLIENT_COLLABORATOR", status: "ACTIVE", permissions: ["content:approve"] });
    expect((await ownerDb.user.findUniqueOrThrow({ where: { id: r.userId } })).role).toBe("USER");
    const b = await inviteCollaborator(appDb, owner, { email: email("aceita-comum"), approve: false });
    const r2 = await acceptInvitation(appDb, { token: b.token, name: "Outra Pessoa", password: SENHA });
    expect((await member(w.clientA, r2.userId)).permissions).toEqual([]);
    // o link e de uso unico
    await expect(acceptInvitation(appDb, { token: a.token, name: "Pessoa Ficticia", password: SENHA })).rejects.toBeDefined();
  });

  it("colaborador, STAFF atribuida e dono de outro cliente nao convidam por este servico", async () => {
    await expect(inviteCollaborator(appDb, collab, { email: email("x"), approve: false })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(inviteCollaborator(appDb, staff, { email: email("x"), approve: false })).rejects.toBeInstanceOf(ForbiddenError);
    // dono do B convida: o convite nasce no B, nunca no A
    const inv = await inviteCollaborator(appDb, ownerB, { email: email("do-b"), approve: false });
    expect((await ownerDb.invitation.findUniqueOrThrow({ where: { id: inv.invitationId } })).clientId).toBe(w.clientB);
  });
});

describe("o banco impoe: convite por SQL direto como nexo_app", () => {
  it("o dono ativo cria convite de colaborador do proprio cliente (o unico caso aberto)", async () => {
    await expect(insertInvite(owner)).resolves.toBeDefined();
    await expect(insertInvite(owner, { perms: "ARRAY['content:approve']" })).resolves.toBeDefined();
  });

  it("o dono NAO cria convite de OWNER nem de STAFF", async () => {
    await expect(insertInvite(owner, { role: "CLIENT_OWNER" })).rejects.toThrow(REFUSED);
    await expect(insertInvite(owner, { role: "STAFF" })).rejects.toThrow(REFUSED);
  });

  it("o dono NAO cria convite para OUTRO cliente (nem com client_id de B)", async () => {
    await expect(insertInvite(owner, { clientId: w.clientB })).rejects.toThrow(/row-level|convite/i);
    await expect(insertInvite(ownerB, { clientId: w.clientA })).rejects.toThrow(/row-level|convite/i);
  });

  it("o dono NAO concede permissao que nao existe nem que nao tem; nem forja convidante, validade ou uso", async () => {
    for (const perms of ["ARRAY['content:write']", "ARRAY['plan:manage']", "ARRAY['content:approve','content:write']", "ARRAY['-content:write']", "ARRAY['team:manage']"]) {
      await expect(insertInvite(owner, { perms }), perms).rejects.toThrow(/convite|check|constraint|violat/i);
    }
    await expect(insertInvite(owner, { by: w.admin.id })).rejects.toThrow(REFUSED);
    await expect(insertInvite(owner, { expires: "30 days" })).rejects.toThrow(REFUSED);
    await expect(insertInvite(owner, { usedAt: true })).rejects.toThrow(REFUSED);
  });

  it("colaborador e STAFF atribuida nao criam convite nenhum; o ADMIN cria ate de OWNER (controle)", async () => {
    await expect(insertInvite(collab)).rejects.toThrow(REFUSED);
    await expect(insertInvite(staff)).rejects.toThrow(REFUSED);
    await expect(insertInvite(admin, { role: "CLIENT_OWNER" })).resolves.toBeDefined();
    await expect(insertInvite(admin)).resolves.toBeDefined();
  });

  it("o dono so REVOGA convite pendente de colaborador: nao muda e-mail, papel ou permissoes, nem apaga, nem toca convite de OWNER", async () => {
    const mine = await ownerDb.invitation.findFirstOrThrow({ where: { clientId: w.clientA, role: "CLIENT_COLLABORATOR", usedAt: null, revokedAt: null } });
    await expect(sql(owner, `UPDATE invitations SET role = 'CLIENT_OWNER' WHERE id = '${mine.id}'`)).rejects.toThrow(REFUSED);
    await expect(sql(owner, `UPDATE invitations SET email = 'outro@teste.test' WHERE id = '${mine.id}'`)).rejects.toThrow(REFUSED);
    await expect(sql(owner, `UPDATE invitations SET permissions = ARRAY['content:approve'] WHERE id = '${mine.id}'`)).rejects.toThrow(REFUSED);
    await expect(sql(owner, `UPDATE invitations SET expires_at = now() + interval '5 days', revoked_at = now() WHERE id = '${mine.id}'`)).rejects.toThrow(REFUSED);
    await expect(sql(owner, `DELETE FROM invitations WHERE id = '${mine.id}'`)).rejects.toThrow(REFUSED);
    const ownerInvite = await ownerDb.invitation.findFirstOrThrow({ where: { clientId: w.clientA, role: "CLIENT_OWNER", usedAt: null, revokedAt: null } });
    await expect(sql(owner, `UPDATE invitations SET revoked_at = now() WHERE id = '${ownerInvite.id}'`)).rejects.toThrow(REFUSED);
    await expect(sql(owner, `UPDATE invitations SET revoked_at = now() WHERE id = '${mine.id}'`)).resolves.toBeDefined();
    expect((await ownerDb.invitation.findUniqueOrThrow({ where: { id: ownerInvite.id } })).revokedAt).toBeNull();
    // colaborador nao revoga
    const other = await ownerDb.invitation.findFirstOrThrow({ where: { clientId: w.clientA, role: "CLIENT_COLLABORATOR", usedAt: null, revokedAt: null } });
    await expect(sql(collab, `UPDATE invitations SET revoked_at = now() WHERE id = '${other.id}'`)).rejects.toThrow(REFUSED);
  });

  it("dono de B nao revoga nem le convite de A (RLS: zero linhas, nada muda)", async () => {
    const inA = await ownerDb.invitation.findFirstOrThrow({ where: { clientId: w.clientA, role: "CLIENT_COLLABORATOR", usedAt: null, revokedAt: null } });
    await sql(ownerB, `UPDATE invitations SET revoked_at = now() WHERE id = '${inA.id}'`);
    expect((await ownerDb.invitation.findUniqueOrThrow({ where: { id: inA.id } })).revokedAt).toBeNull();
    await withTenant(appDb, ownerB, async ({ tx }) => {
      const rows = await tx.$queryRawUnsafe<{ client_id: string }[]>("SELECT client_id FROM invitations");
      expect(rows.every((r) => r.client_id === w.clientB)).toBe(true);
    });
  });
});

describe("o banco impoe: membros por SQL direto como nexo_app", () => {
  it("o dono muda permissoes e acesso de um colaborador do proprio cliente (o unico caso aberto)", async () => {
    const id = collab2.memberId;
    await sql(owner, `UPDATE client_members SET permissions = ARRAY['content:approve'] WHERE id = '${id}'`);
    expect((await ownerDb.clientMember.findUniqueOrThrow({ where: { id } })).permissions).toEqual(["content:approve"]);
    await sql(owner, `UPDATE client_members SET permissions = ARRAY[]::text[], status = 'REVOKED' WHERE id = '${id}'`);
    expect(await ownerDb.clientMember.findUniqueOrThrow({ where: { id } })).toMatchObject({ permissions: [], status: "REVOKED" });
    await sql(owner, `UPDATE client_members SET status = 'ACTIVE' WHERE id = '${id}'`);
    expect((await ownerDb.clientMember.findUniqueOrThrow({ where: { id } })).status).toBe("ACTIVE");
  });

  it("o dono NAO cria, promove, troca de pessoa nem de cliente um membro, e nao apaga ninguem", async () => {
    const id = collab2.memberId;
    await expect(sql(owner, `UPDATE client_members SET role = 'CLIENT_OWNER' WHERE id = '${id}'`)).rejects.toThrow(REFUSED);
    await expect(sql(owner, `UPDATE client_members SET role = 'STAFF' WHERE id = '${id}'`)).rejects.toThrow(/./);
    await expect(sql(owner, `UPDATE client_members SET user_id = '${w.ownerB.id}' WHERE id = '${id}'`)).rejects.toThrow(/./);
    await expect(sql(owner, `UPDATE client_members SET client_id = '${w.clientB}' WHERE id = '${id}'`)).rejects.toThrow(/./);
    await expect(sql(owner, `DELETE FROM client_members WHERE id = '${id}'`)).rejects.toThrow(REFUSED);
    await expect(sql(owner, `INSERT INTO client_members (client_id, user_id, role) VALUES ('${w.clientA}', '${w.ownerB.id}', 'CLIENT_COLLABORATOR')`)).rejects.toThrow(REFUSED);
    await expect(sql(owner, `INSERT INTO client_members (client_id, user_id, role) VALUES ('${w.clientA}', '${w.ownerB.id}', 'CLIENT_OWNER')`)).rejects.toThrow(REFUSED);
    expect(await ownerDb.clientMember.findUniqueOrThrow({ where: { id } })).toMatchObject({ role: "CLIENT_COLLABORATOR", clientId: w.clientA, userId: collab2.id });
  });

  it("o dono NAO concede permissao alem de content:approve", async () => {
    const id = collab2.memberId;
    for (const perms of ["ARRAY['content:write']", "ARRAY['content:approve','script:write']", "ARRAY['-content:write']", "ARRAY['team:manage']"]) {
      await expect(sql(owner, `UPDATE client_members SET permissions = ${perms} WHERE id = '${id}'`), perms).rejects.toThrow(REFUSED);
    }
    expect((await ownerDb.clientMember.findUniqueOrThrow({ where: { id } })).permissions).toEqual([]);
  });

  it("o dono NAO mexe em si mesmo, em outro dono, em STAFF, nem em outro cliente", async () => {
    const own = await member(w.clientA, w.ownerA.id);
    await expect(sql(owner, `UPDATE client_members SET status = 'REVOKED' WHERE id = '${own.id}'`)).rejects.toThrow(REFUSED);
    await expect(sql(owner, `UPDATE client_members SET role = 'CLIENT_COLLABORATOR' WHERE id = '${own.id}'`)).rejects.toThrow(REFUSED);
    await expect(sql(owner, `UPDATE client_members SET permissions = ARRAY['content:approve'] WHERE id = '${own.id}'`)).rejects.toThrow(REFUSED);
    await expect(sql(owner, `UPDATE client_members SET status = 'REVOKED' WHERE id = '${owner2User.memberId}'`)).rejects.toThrow(REFUSED);
    await expect(sql(owner2, `UPDATE client_members SET status = 'REVOKED' WHERE id = '${own.id}'`)).rejects.toThrow(REFUSED);
    const staffMember = await member(w.clientA, w.staffAssignedA.id);
    await expect(sql(owner, `UPDATE client_members SET status = 'REVOKED' WHERE id = '${staffMember.id}'`)).rejects.toThrow(REFUSED);
    // outro cliente: a RLS esconde a linha (0 afetadas, sem erro) e nada muda
    await sql(owner, `UPDATE client_members SET status = 'REVOKED' WHERE id = '${collabB.memberId}'`);
    await sql(ownerB, `UPDATE client_members SET status = 'REVOKED' WHERE id = '${collab2.memberId}'`);
    expect((await ownerDb.clientMember.findUniqueOrThrow({ where: { id: collabB.memberId } })).status).toBe("ACTIVE");
    expect((await ownerDb.clientMember.findUniqueOrThrow({ where: { id: collab2.memberId } })).status).toBe("ACTIVE");
    expect((await ownerDb.clientMember.findUniqueOrThrow({ where: { id: own.id } })).status).toBe("ACTIVE");
  });

  it("colaborador (mesmo com a permissao de aprovar) e STAFF atribuida nao escrevem membros", async () => {
    const grantee = await makeUser("USER", "colab-aprova-2");
    const gm = await addMember(w.clientA, grantee.id, "CLIENT_COLLABORATOR");
    await ownerDb.clientMember.update({ where: { id: gm.id }, data: { permissions: ["content:approve"] } });
    const granteeCtx = await resolveTenantContext(appDb, { userId: grantee.id, activeClientId: w.clientA });
    for (const ctx of [collab, granteeCtx, staff]) {
      await expect(sql(ctx, `UPDATE client_members SET permissions = ARRAY['content:approve'] WHERE id = '${collab2.memberId}'`)).rejects.toThrow(REFUSED);
      await expect(sql(ctx, `UPDATE client_members SET status = 'REVOKED' WHERE id = '${collab2.memberId}'`)).rejects.toThrow(REFUSED);
    }
    expect((await ownerDb.clientMember.findUniqueOrThrow({ where: { id: collab2.memberId } })).status).toBe("ACTIVE");
  });

  it("dono com participacao REVOGADA perde o poder (o gatilho confere o estado no banco, nao so o contexto)", async () => {
    const ownerMember = await member(w.clientA, w.ownerA.id);
    await ownerDb.clientMember.update({ where: { id: ownerMember.id }, data: { status: "REVOKED" } });
    try {
      await expect(sql(owner, `UPDATE client_members SET status = 'REVOKED' WHERE id = '${collab2.memberId}'`)).rejects.toThrow(REFUSED);
      await expect(insertInvite(owner)).rejects.toThrow(REFUSED);
    } finally {
      await ownerDb.clientMember.update({ where: { id: ownerMember.id }, data: { status: "ACTIVE" } });
    }
  });

  it("controle: ADMIN muda tudo (inclusive papel) e o escopo de sistema grava membro no aceite de convite", async () => {
    const id = collab2.memberId;
    await sql(admin, `UPDATE client_members SET permissions = ARRAY['content:write'] WHERE id = '${id}'`);
    await sql(admin, `UPDATE client_members SET permissions = ARRAY[]::text[] WHERE id = '${id}'`);
    const e = email("sistema");
    const created = await createInvitation(appDb, admin, { email: e, role: "CLIENT_COLLABORATOR" });
    const accepted = await acceptInvitation(appDb, { token: created.token, name: "Pessoa Ficticia", password: SENHA });
    expect((await member(w.clientA, accepted.userId)).permissions).toEqual([]);
  });

  it("leitura: pessoa do cliente le os membros do PROPRIO cliente e nunca os de outro", async () => {
    for (const ctx of [owner, collab]) {
      await withTenant(appDb, ctx, async ({ tx }) => {
        const rows = await tx.$queryRawUnsafe<{ client_id: string; user_id: string }[]>("SELECT client_id, user_id FROM client_members");
        expect(rows.length).toBeGreaterThan(2);
        expect(rows.every((r) => r.client_id === w.clientA)).toBe(true);
        expect(rows.map((r) => r.user_id)).not.toContain(collabB.id);
      });
    }
  });
});

describe("servico de equipe: respostas claras, isolamento e auditoria", () => {
  it("lista so as pessoas do cliente (nunca a equipe da agencia), sem hash de token, e so para o dono", async () => {
    const team = await loadTeam(appDb, owner);
    const emails = team.members.map((m) => m.email);
    expect(emails).toContain(w.ownerA.email);
    expect(emails).toContain(w.collabA.email);
    expect(emails).not.toContain(w.staffAssignedA.email);
    expect(emails).not.toContain(w.ownerB.email);
    expect(team.members.find((m) => m.email === w.ownerA.email)).toMatchObject({ isSelf: true, manageable: false, role: "CLIENT_OWNER" });
    expect(team.members.find((m) => m.email === w.collabA.email)).toMatchObject({ isSelf: false, manageable: true });
    expect(team.members.find((m) => m.id === owner2User.memberId)).toMatchObject({ manageable: false });
    expect(JSON.stringify(team)).not.toMatch(/token|hash/i);
    expect(team.invitations.every((i) => i.expiresAt.getTime() > Date.now())).toBe(true);
    await expect(loadTeam(appDb, collab)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(loadTeam(appDb, staff)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await loadTeam(appDb, ownerB)).members.map((m) => m.email)).not.toContain(w.collabA.email);
  });

  it("permissao e acesso do colaborador mudam, voltam e geram auditoria; nada vaza para o outro cliente", async () => {
    const id = collab2.memberId;
    expect(await setCollaboratorApproval(appDb, owner, id, true)).toEqual({ canApprove: true });
    expect((await member(w.clientA, collab2.id)).permissions).toEqual(["content:approve"]);
    expect(await setCollaboratorApproval(appDb, owner, id, false)).toEqual({ canApprove: false });
    expect(await setCollaboratorActive(appDb, owner, id, false)).toEqual({ active: false });
    expect((await member(w.clientA, collab2.id)).status).toBe("REVOKED");
    // desativado: a pessoa nao resolve mais contexto neste cliente
    await expect(resolveTenantContext(appDb, { userId: collab2.id, activeClientId: w.clientA })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await setCollaboratorActive(appDb, owner, id, true)).toEqual({ active: true });
    const actions = (await ownerDb.auditLog.findMany({ where: { entityId: id, actorId: w.ownerA.id } })).map((a) => a.action).sort();
    expect(actions).toEqual(["team.member_deactivated", "team.member_reactivated", "team.permissions_changed", "team.permissions_changed"]);
  });

  it("recusa clara: a si mesmo (409), a outro dono e a STAFF (403), a membro de outro cliente (404)", async () => {
    const own = await member(w.clientA, w.ownerA.id);
    await expect(setCollaboratorActive(appDb, owner, own.id, false)).rejects.toMatchObject({ status: 409, code: "SELF_MANAGE" });
    await expect(setCollaboratorApproval(appDb, owner, own.id, true)).rejects.toMatchObject({ status: 409, code: "SELF_MANAGE" });
    await expect(setCollaboratorActive(appDb, owner, owner2User.memberId, false)).rejects.toBeInstanceOf(ForbiddenError);
    const staffMember = await member(w.clientA, w.staffAssignedA.id);
    await expect(setCollaboratorActive(appDb, owner, staffMember.id, false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setCollaboratorApproval(appDb, owner, collabB.memberId, true)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setCollaboratorActive(appDb, ownerB, collab2.memberId, false)).rejects.toBeInstanceOf(NotFoundError);
    await expect(setCollaboratorActive(appDb, owner, randomUUID(), false)).rejects.toBeInstanceOf(NotFoundError);
    // colaborador e STAFF nao gerenciam
    await expect(setCollaboratorActive(appDb, collab, collab2.memberId, false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setCollaboratorApproval(appDb, staff, collab2.memberId, true)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await member(w.clientA, w.ownerA.id)).status).toBe("ACTIVE");
    expect((await ownerDb.clientMember.findUniqueOrThrow({ where: { id: collabB.memberId } })).status).toBe("ACTIVE");
  });

  it("revogar convite: so pendente de colaborador do proprio cliente (404 nos outros casos); gera auditoria", async () => {
    const inv = await inviteCollaborator(appDb, owner, { email: email("revoga"), approve: false });
    await expect(revokeTeamInvitation(appDb, ownerB, inv.invitationId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(revokeTeamInvitation(appDb, collab, inv.invitationId)).rejects.toBeInstanceOf(ForbiddenError);
    await revokeTeamInvitation(appDb, owner, inv.invitationId);
    expect((await ownerDb.invitation.findUniqueOrThrow({ where: { id: inv.invitationId } })).revokedAt).not.toBeNull();
    await expect(revokeTeamInvitation(appDb, owner, inv.invitationId)).rejects.toBeInstanceOf(NotFoundError);
    // convite de OWNER criado pelo admin: o dono nao revoga
    const ownerInvite = await createInvitation(appDb, admin, { email: email("dono-novo"), role: "CLIENT_OWNER" });
    await expect(revokeTeamInvitation(appDb, owner, ownerInvite.invitationId)).rejects.toBeInstanceOf(NotFoundError);
    expect((await ownerDb.invitation.findUniqueOrThrow({ where: { id: ownerInvite.invitationId } })).revokedAt).toBeNull();
    expect(await ownerDb.auditLog.count({ where: { action: "team.invitation_revoked", entityId: inv.invitationId } })).toBe(1);
  });

  it("cliente com acesso revogado ao proprio cliente nao tem contexto: nao ha como convidar", async () => {
    const ghost = await makeUser("USER", "dono-fantasma");
    const gm = await addMember(w.clientA, ghost.id, "CLIENT_OWNER");
    await ownerDb.clientMember.update({ where: { id: gm.id }, data: { status: "REVOKED" } });
    await expect(resolveTenantContext(appDb, { userId: ghost.id, activeClientId: w.clientA })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
