import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveTenantContext, switchActiveClient } from "@/server/authorization/context";
import { withTenant } from "@/server/db/scope";
import { ForbiddenError } from "@/server/errors";
import { getClientById, updateClient } from "@/server/repositories/clients";
import { addMember, appDb, makeUser, makeWorld, ownerDb, type World } from "./helpers/world";

let w: World;
beforeAll(async () => {
  w = await makeWorld();
});

describe("STAFF e atribuicao a clientes", () => {
  it("STAFF nao atribuido nao acessa o cliente", async () => {
    await expect(resolveTenantContext(appDb, { userId: w.staffUnassigned.id, activeClientId: w.clientA })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(resolveTenantContext(appDb, { userId: w.staffUnassigned.id, activeClientId: w.clientB })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("STAFF atribuido ao A acessa o A, mas nao o B", async () => {
    const ctx = await resolveTenantContext(appDb, { userId: w.staffAssignedA.id, activeClientId: w.clientA });
    expect((await withTenant(appDb, ctx, (s) => getClientById(s, w.clientA)))?.id).toBe(w.clientA);
    expect(await withTenant(appDb, ctx, (s) => getClientById(s, w.clientB))).toBeNull();
    await expect(resolveTenantContext(appDb, { userId: w.staffAssignedA.id, activeClientId: w.clientB })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("STAFF atribuido nao tem administracao global (nao altera o cliente)", async () => {
    const ctx = await resolveTenantContext(appDb, { userId: w.staffAssignedA.id, activeClientId: w.clientA });
    await expect(withTenant(appDb, ctx, (s) => updateClient(s, w.clientA, { name: "x" }))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("desatribuir o STAFF (membro revogado) bloqueia na requisicao seguinte", async () => {
    const staff = await makeUser("STAFF", "staff-temp");
    const m = await addMember(w.clientA, staff.id, "STAFF");
    await expect(resolveTenantContext(appDb, { userId: staff.id, activeClientId: w.clientA })).resolves.toBeDefined();
    await ownerDb.clientMember.update({ where: { id: m.id }, data: { status: "REVOKED" } });
    await expect(resolveTenantContext(appDb, { userId: staff.id, activeClientId: w.clientA })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("STAFF nao atribuido nao consegue trocar o cliente ativo da sessao", async () => {
    const token = randomUUID();
    await ownerDb.session.create({
      data: { userId: w.staffUnassigned.id, token, expiresAt: new Date(Date.now() + 3600_000), activeClientId: null },
    });
    await expect(
      switchActiveClient(appDb, { sessionToken: token, userId: w.staffUnassigned.id, requestedClientId: w.clientA }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await ownerDb.session.findUniqueOrThrow({ where: { token } })).activeClientId).toBeNull();
  });

  it("troca de cliente funciona para quem e membro e grava na sessao", async () => {
    const token = randomUUID();
    await ownerDb.session.create({ data: { userId: w.ownerA.id, token, expiresAt: new Date(Date.now() + 3600_000) } });
    await switchActiveClient(appDb, { sessionToken: token, userId: w.ownerA.id, requestedClientId: w.clientA });
    expect((await ownerDb.session.findUniqueOrThrow({ where: { token } })).activeClientId).toBe(w.clientA);
  });

  it("a sessao de outra pessoa nao pode ser trocada (token e usuario precisam casar)", async () => {
    const token = randomUUID();
    await ownerDb.session.create({ data: { userId: w.ownerB.id, token, expiresAt: new Date(Date.now() + 3600_000) } });
    await expect(
      switchActiveClient(appDb, { sessionToken: token, userId: w.ownerA.id, requestedClientId: w.clientA }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect((await ownerDb.session.findUniqueOrThrow({ where: { token } })).activeClientId).toBeNull();
  });
});

describe("conta bloqueada, cliente suspenso e papeis", () => {
  it("conta bloqueada perde o acesso na requisicao seguinte", async () => {
    const u = await makeUser("USER", "bloqueavel");
    await addMember(w.clientA, u.id, "CLIENT_COLLABORATOR");
    await expect(resolveTenantContext(appDb, { userId: u.id, activeClientId: w.clientA })).resolves.toBeDefined();
    await ownerDb.user.update({ where: { id: u.id }, data: { banned: true } });
    await expect(resolveTenantContext(appDb, { userId: u.id, activeClientId: w.clientA })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("cliente arquivado nao e acessivel nem por quem e membro", async () => {
    const c = await ownerDb.client.create({ data: { name: "Arquivado", slug: `arq-${randomUUID().slice(0, 8)}`, status: "ARCHIVED" } });
    const u = await makeUser("USER", "membro-arq");
    await addMember(c.id, u.id, "CLIENT_OWNER");
    await expect(resolveTenantContext(appDb, { userId: u.id, activeClientId: c.id })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("ADMIN acessa qualquer cliente ativo, sem ser membro", async () => {
    await expect(resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: w.clientA })).resolves.toMatchObject({ memberRole: null });
    await expect(resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: w.clientB })).resolves.toMatchObject({ memberRole: null });
  });

  it("o banco recusa STAFF membro sem papel global STAFF e papel de cliente para STAFF", async () => {
    const comum = await makeUser("USER", "comum");
    await expect(addMember(w.clientA, comum.id, "STAFF")).rejects.toThrow(/STAFF/);
    const staff = await makeUser("STAFF", "staff-x");
    await expect(addMember(w.clientA, staff.id, "CLIENT_OWNER")).rejects.toThrow(/papel global USER/);
  });

  it("participacao duplicada no mesmo cliente e recusada pelo unico composto", async () => {
    await expect(addMember(w.clientA, w.ownerA.id, "CLIENT_OWNER")).rejects.toThrow(/Unique constraint/i);
  });
});
