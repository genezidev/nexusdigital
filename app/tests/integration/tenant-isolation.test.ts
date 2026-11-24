import { beforeAll, describe, expect, it } from "vitest";
import { resolveTenantContext, type TenantContext } from "@/server/authorization/context";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/scope";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { listAudit } from "@/server/repositories/audit";
import { archiveClient, getClientById, listClients, updateClient } from "@/server/repositories/clients";
import { getInvitationById, listInvitations, revokeInvitation } from "@/server/repositories/invitations";
import { getMemberById, listMembers, removeMember, setMemberStatus } from "@/server/repositories/members";
import { appDb, makeWorld, ownerDb, type World } from "./helpers/world";

// A mesma suite roda em duas conexoes:
//  - "app": papel nexo_app, com RLS ligado (producao); protege codigo E banco.
//  - "dono": superusuario, que IGNORA a RLS; so o filtro do repositorio protege.
// Assim um filtro de client_id esquecido no codigo derruba o teste mesmo com a RLS ligada.
describe.each<[string, Db]>([
  ["conexao do app (RLS + filtro no codigo)", appDb],
  ["conexao do dono (somente o filtro no codigo)", ownerDb],
])("isolamento entre clientes: %s", (_nome, db) => {
  let w: World;
  let adminA: TenantContext; // ADMIN com o Cliente A ativo
  let ownerA: TenantContext; // dono do Cliente A

  beforeAll(async () => {
    w = await makeWorld();
    adminA = await resolveTenantContext(db, { userId: w.admin.id, activeClientId: w.clientA });
    ownerA = await resolveTenantContext(db, { userId: w.ownerA.id, activeClientId: w.clientA });
  });

  it("usuario do Cliente A nao consegue ativar o Cliente B na sessao", async () => {
    await expect(resolveTenantContext(db, { userId: w.ownerA.id, activeClientId: w.clientB })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(resolveTenantContext(db, { userId: w.ownerA.id, activeClientId: null })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("nao le o Cliente B por id e a listagem traz so o Cliente A", async () => {
    expect(await withTenant(db, ownerA, (s) => getClientById(s, w.clientB))).toBeNull();
    expect((await withTenant(db, ownerA, (s) => getClientById(s, w.clientA)))?.id).toBe(w.clientA);
    const lista = await withTenant(db, ownerA, (s) => listClients(s));
    expect(lista.map((c) => c.id)).toEqual([w.clientA]);
  });

  it("nao le membros do Cliente B por id e nao os lista", async () => {
    expect(await withTenant(db, adminA, (s) => getMemberById(s, w.memberOwnerB))).toBeNull();
    expect((await withTenant(db, adminA, (s) => getMemberById(s, w.memberOwnerA)))?.id).toBe(w.memberOwnerA);
    const lista = await withTenant(db, adminA, (s) => listMembers(s));
    expect(lista.length).toBeGreaterThanOrEqual(3);
    expect(lista.every((m) => m.clientId === w.clientA)).toBe(true);
    expect(lista.some((m) => m.id === w.memberOwnerB)).toBe(false);
  });

  it("nao le convites do Cliente B por id e nao os lista; token_hash nunca sai", async () => {
    expect(await withTenant(db, adminA, (s) => getInvitationById(s, w.invitationB))).toBeNull();
    const um = await withTenant(db, adminA, (s) => getInvitationById(s, w.invitationA));
    expect(um?.id).toBe(w.invitationA);
    expect(um).not.toHaveProperty("tokenHash");
    const lista = await withTenant(db, adminA, (s) => listInvitations(s));
    expect(lista.length).toBeGreaterThanOrEqual(1);
    expect(lista.every((i) => i.clientId === w.clientA)).toBe(true);
  });

  it("auditoria lista so o Cliente A", async () => {
    const logs = await withTenant(db, adminA, (s) => listAudit(s));
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs.every((l) => l.clientId === w.clientA)).toBe(true);
  });

  it("nao altera o Cliente B por id (e o registro de B continua igual)", async () => {
    const antes = await ownerDb.client.findUniqueOrThrow({ where: { id: w.clientB } });
    await expect(withTenant(db, adminA, (s) => updateClient(s, w.clientB, { name: "INVADIDO" }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(withTenant(db, adminA, (s) => archiveClient(s, w.clientB))).rejects.toBeInstanceOf(NotFoundError);
    const depois = await ownerDb.client.findUniqueOrThrow({ where: { id: w.clientB } });
    expect(depois.name).toBe(antes.name);
    expect(depois.status).toBe("ACTIVE");
  });

  it("nao altera nem apaga membro do Cliente B por id", async () => {
    await expect(withTenant(db, adminA, (s) => setMemberStatus(s, w.memberOwnerB, "REVOKED"))).rejects.toBeInstanceOf(NotFoundError);
    await expect(withTenant(db, adminA, (s) => removeMember(s, w.memberOwnerB))).rejects.toBeInstanceOf(NotFoundError);
    const m = await ownerDb.clientMember.findUnique({ where: { id: w.memberOwnerB } });
    expect(m?.status).toBe("ACTIVE");
  });

  it("nao revoga convite do Cliente B por id", async () => {
    await expect(withTenant(db, adminA, (s) => revokeInvitation(s, w.invitationB, new Date()))).rejects.toBeInstanceOf(NotFoundError);
    const inv = await ownerDb.invitation.findUniqueOrThrow({ where: { id: w.invitationB } });
    expect(inv.revokedAt).toBeNull();
  });

  it("o proprio Cliente A continua funcionando (o teste nao passa por estar tudo bloqueado)", async () => {
    const atualizado = await withTenant(db, adminA, (s) => updateClient(s, w.clientA, { contactName: "Contato novo" }));
    expect(atualizado.contactName).toBe("Contato novo");
    await withTenant(db, adminA, (s) => setMemberStatus(s, w.memberOwnerA, "ACTIVE"));
    await withTenant(db, adminA, (s) => revokeInvitation(s, w.invitationA, new Date()));
    const inv = await ownerDb.invitation.findUniqueOrThrow({ where: { id: w.invitationA } });
    expect(inv.revokedAt).not.toBeNull();
  });

  it("dono do cliente nao escreve: permissao conferida no servidor (R-2)", async () => {
    await expect(withTenant(db, ownerA, (s) => updateClient(s, w.clientA, { name: "x" }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(withTenant(db, ownerA, (s) => removeMember(s, w.memberOwnerA))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(withTenant(db, ownerA, (s) => listInvitations(s))).rejects.toBeInstanceOf(ForbiddenError);
  });
});
