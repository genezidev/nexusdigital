import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveTenantContext, type TenantContext } from "@/server/authorization/context";
import { ConflictError, ForbiddenError, InvalidInvitationError, WeakPasswordError } from "@/server/errors";
import { acceptInvitation, createInvitation, hashToken, INVITATION_TTL_MS } from "@/server/services/invitations";
import { appDb, makeUser, makeWorld, ownerDb, type World } from "./helpers/world";

const SENHA = "uma-senha-forte-de-teste-1";
const DAY = 24 * 60 * 60 * 1000;
const email = (p: string) => `${p}-${randomUUID().slice(0, 8)}@convidado.test`;

let w: World;
let adminA: TenantContext;
beforeAll(async () => {
  w = await makeWorld();
  adminA = await resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: w.clientA });
});

describe("convite: criacao e armazenamento", () => {
  it("guarda so o hash, com validade de 7 dias, e audita sem token", async () => {
    const now = new Date();
    const created = await createInvitation(appDb, adminA, { email: email("novo"), role: "CLIENT_OWNER" }, now);
    const row = await ownerDb.invitation.findUniqueOrThrow({ where: { id: created.invitationId } });
    expect(row.tokenHash).toBe(hashToken(created.token));
    expect(row.tokenHash).not.toContain(created.token);
    expect(row.expiresAt.getTime() - now.getTime()).toBe(INVITATION_TTL_MS);
    expect(INVITATION_TTL_MS).toBe(7 * DAY);
    const audit = await ownerDb.auditLog.findMany({ where: { entityId: created.invitationId } });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(created.token);
    expect(JSON.stringify(audit)).not.toContain(row.tokenHash);
  });

  it("quem so le (dono do cliente) nao cria convite", async () => {
    const ownerCtx = await resolveTenantContext(appDb, { userId: w.ownerA.id, activeClientId: w.clientA });
    await expect(createInvitation(appDb, ownerCtx, { email: email("x"), role: "CLIENT_COLLABORATOR" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("convite para e-mail que ja tem conta da conflito (409), mesmo com maiusculas", async () => {
    const existente = await makeUser("USER", "ja-existe");
    const erro = await createInvitation(appDb, adminA, { email: existente.email.toUpperCase(), role: "CLIENT_COLLABORATOR" }).catch((e) => e);
    expect(erro).toBeInstanceOf(ConflictError);
    expect(erro).toMatchObject({ status: 409, code: "EMAIL_TAKEN" });
  });

  it("segundo convite pendente para o mesmo e-mail e cliente da conflito", async () => {
    const e = email("dup");
    await createInvitation(appDb, adminA, { email: e, role: "CLIENT_COLLABORATOR" });
    await expect(createInvitation(appDb, adminA, { email: e, role: "CLIENT_COLLABORATOR" })).rejects.toMatchObject({ status: 409, code: "INVITATION_PENDING" });
  });
});

describe("convite: uso unico e validade", () => {
  it("aceitar cria usuario, senha em hash e participacao; o link so funciona uma vez", async () => {
    const e = email("aceita");
    const { token, invitationId } = await createInvitation(appDb, adminA, { email: e, role: "CLIENT_COLLABORATOR" });
    const { userId, clientId } = await acceptInvitation(appDb, { token, name: "Pessoa Ficticia", password: SENHA });
    expect(clientId).toBe(w.clientA);

    const user = await ownerDb.user.findUniqueOrThrow({ where: { id: userId }, include: { accounts: true, memberships: true } });
    expect(user.email).toBe(e);
    expect(user.role).toBe("USER");
    expect(user.memberships).toHaveLength(1);
    expect(user.memberships[0]).toMatchObject({ clientId: w.clientA, role: "CLIENT_COLLABORATOR", status: "ACTIVE" });
    const senha = user.accounts[0].password ?? "";
    expect(senha).not.toContain(SENHA);
    expect(senha.length).toBeGreaterThan(40);
    expect((await ownerDb.invitation.findUniqueOrThrow({ where: { id: invitationId } })).usedByUserId).toBe(userId);

    // Segunda abertura do mesmo link falha e nao cria outro usuario.
    await expect(acceptInvitation(appDb, { token, name: "Outra", password: SENHA })).rejects.toBeInstanceOf(InvalidInvitationError);
    expect(await ownerDb.user.count({ where: { email: e } })).toBe(1);
  });

  it("convite expirado falha (e o usuario nao e criado)", async () => {
    const e = email("expirado");
    const criadoHa8Dias = new Date(Date.now() - 8 * DAY);
    const { token } = await createInvitation(appDb, adminA, { email: e, role: "CLIENT_COLLABORATOR" }, criadoHa8Dias);
    await expect(acceptInvitation(appDb, { token, name: "Fulano", password: SENHA })).rejects.toBeInstanceOf(InvalidInvitationError);
    expect(await ownerDb.user.count({ where: { email: e } })).toBe(0);
    expect((await ownerDb.invitation.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } })).usedAt).toBeNull();
  });

  it("convite criado ha 6 dias ainda vale (a validade nao e curta demais)", async () => {
    const { token } = await createInvitation(appDb, adminA, { email: email("seis"), role: "CLIENT_COLLABORATOR" }, new Date(Date.now() - 6 * DAY));
    await expect(acceptInvitation(appDb, { token, name: "Fulano", password: SENHA })).resolves.toBeDefined();
  });

  it("convite revogado falha", async () => {
    const e = email("revogado");
    const { token, invitationId } = await createInvitation(appDb, adminA, { email: e, role: "CLIENT_COLLABORATOR" });
    await ownerDb.invitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } });
    await expect(acceptInvitation(appDb, { token, name: "Fulano", password: SENHA })).rejects.toBeInstanceOf(InvalidInvitationError);
  });

  it("token inexistente da o mesmo erro que usado ou expirado (nao revela nada)", async () => {
    const erro = await acceptInvitation(appDb, { token: "token-que-nao-existe", name: "Fulano", password: SENHA }).catch((e) => e);
    expect(erro).toBeInstanceOf(InvalidInvitationError);
    expect(erro).toMatchObject({ status: 410, message: "Convite invalido ou expirado." });
  });

  it("dois aceites simultaneos do mesmo link: exatamente um vence", async () => {
    const { token } = await createInvitation(appDb, adminA, { email: email("corrida"), role: "CLIENT_COLLABORATOR" });
    const r = await Promise.allSettled([
      acceptInvitation(appDb, { token, name: "A", password: SENHA }),
      acceptInvitation(appDb, { token, name: "B", password: SENHA }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(1);
  });

  it("senha curta e recusada sem gastar o convite", async () => {
    const { token } = await createInvitation(appDb, adminA, { email: email("fraca"), role: "CLIENT_COLLABORATOR" });
    await expect(acceptInvitation(appDb, { token, name: "Fulano", password: "curta123" })).rejects.toBeInstanceOf(WeakPasswordError);
    await expect(acceptInvitation(appDb, { token, name: "Fulano", password: SENHA })).resolves.toBeDefined();
  });
});

describe("e-mail duplicado", () => {
  it("conta criada depois do convite: aceitar da conflito e o convite nao e consumido", async () => {
    const e = email("corrida-email");
    const { token } = await createInvitation(appDb, adminA, { email: e, role: "CLIENT_COLLABORATOR" });
    await ownerDb.user.create({ data: { email: e, name: "Chegou antes" } });
    const erro = await acceptInvitation(appDb, { token, name: "Fulano", password: SENHA }).catch((x) => x);
    expect(erro).toBeInstanceOf(ConflictError);
    expect(erro).toMatchObject({ status: 409 });
    expect((await ownerDb.invitation.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } })).usedAt).toBeNull();
    expect(await ownerDb.user.count({ where: { email: e } })).toBe(1);
  });

  it("o banco tambem recusa e-mail repetido e e-mail com maiusculas", async () => {
    const u = await makeUser("USER", "unico");
    await expect(ownerDb.user.create({ data: { email: u.email, name: "Copia" } })).rejects.toThrow(/Unique constraint/i);
    await expect(ownerDb.user.create({ data: { email: `MAIUSCULA-${randomUUID().slice(0, 6)}@teste.test`, name: "Maiuscula" } })).rejects.toThrow();
  });
});
