import { beforeAll, describe, expect, it } from "vitest";
import { resolveTenantContext, systemContextForSeed, type TenantContext } from "@/server/authorization/context";
import { withSystem, withTenant } from "@/server/db/scope";
import { appDb, makeClient, makeUser, makeWorld, ownerDb, type World } from "./helpers/world";

// Segunda camada (D-0003/D-0004): aqui o codigo do repositorio e IGNORADO de proposito.
// Consultas cruas no escopo do Cliente A nao podem alcancar linhas do Cliente B.
let w: World;
let ctxA: TenantContext;
beforeAll(async () => {
  w = await makeWorld();
  ctxA = await resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: w.clientA });
});

describe("RLS no PostgreSQL (papel nexo_app)", () => {
  it("o papel do app nao e superusuario nem ignora RLS", async () => {
    const rows = await appDb.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it("sem contexto de cliente, nenhuma linha de cliente e visivel (nega por padrao)", async () => {
    expect(await appDb.clientMember.findMany()).toEqual([]);
    expect(await appDb.invitation.findMany()).toEqual([]);
    expect(await appDb.client.findMany()).toEqual([]);
    expect(await appDb.auditLog.findMany()).toEqual([]);
  });

  it("consulta crua, sem where, no escopo do A devolve so linhas do A", async () => {
    await withTenant(appDb, ctxA, async ({ tx }) => {
      const members = await tx.clientMember.findMany();
      const invs = await tx.invitation.findMany();
      const clients = await tx.client.findMany();
      const logs = await tx.auditLog.findMany();
      expect(members.length).toBeGreaterThan(0);
      expect(members.every((m) => m.clientId === w.clientA)).toBe(true);
      expect(invs.every((i) => i.clientId === w.clientA)).toBe(true);
      expect(clients.map((c) => c.id)).toEqual([w.clientA]);
      expect(logs.every((l) => l.clientId === w.clientA)).toBe(true);
      expect(await tx.clientMember.findUnique({ where: { id: w.memberOwnerB } })).toBeNull();
    });
  });

  it("update e delete crus em linha do B afetam 0 linhas", async () => {
    await withTenant(appDb, ctxA, async ({ tx }) => {
      expect((await tx.clientMember.updateMany({ where: { id: w.memberOwnerB }, data: { status: "REVOKED" } })).count).toBe(0);
      expect((await tx.clientMember.deleteMany({ where: { id: w.memberOwnerB } })).count).toBe(0);
      expect((await tx.invitation.deleteMany({ where: { id: w.invitationB } })).count).toBe(0);
      expect((await tx.client.updateMany({ where: { id: w.clientB }, data: { name: "INVADIDO" } })).count).toBe(0);
    });
    expect((await ownerDb.clientMember.findUniqueOrThrow({ where: { id: w.memberOwnerB } })).status).toBe("ACTIVE");
    expect(await ownerDb.invitation.findUnique({ where: { id: w.invitationB } })).not.toBeNull();
  });

  it("inserir linha do B estando no escopo do A e recusado pelo banco", async () => {
    await expect(
      withTenant(appDb, ctxA, ({ tx }) =>
        tx.invitation.create({
          data: {
            clientId: w.clientB,
            invitedById: w.admin.id,
            email: "invasor@convidado.test",
            role: "CLIENT_COLLABORATOR",
            tokenHash: "a".repeat(64),
            expiresAt: new Date(Date.now() + 3600_000),
          },
        }),
      ),
    ).rejects.toThrow(/row-level security|violates/i);
    await expect(
      withTenant(appDb, ctxA, ({ tx }) => tx.auditLog.create({ data: { clientId: w.clientB, action: "falso", entityType: "x" } })),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it("mover linha do A para o B (UPDATE client_id) e recusado", async () => {
    await expect(
      withTenant(appDb, ctxA, ({ tx }) => tx.clientMember.update({ where: { id: w.memberOwnerA }, data: { clientId: w.clientB } })),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it("auditoria e append-only para o app: sem UPDATE e sem DELETE", async () => {
    const log = await ownerDb.auditLog.findFirstOrThrow({ where: { clientId: w.clientA } });
    await expect(withTenant(appDb, ctxA, ({ tx }) => tx.auditLog.update({ where: { id: log.id }, data: { action: "adulterado" } }))).rejects.toThrow(/permission denied/i);
    await expect(withTenant(appDb, ctxA, ({ tx }) => tx.auditLog.delete({ where: { id: log.id } }))).rejects.toThrow(/permission denied/i);
    expect((await ownerDb.auditLog.findUniqueOrThrow({ where: { id: log.id } })).action).toBe(log.action);
  });

  // B-1 (D-0007): antes, DELETE em users disparava ON DELETE SET NULL e reescrevia audit_logs.actor_id.
  it("o app nao apaga usuario (sem DELETE no GRANT) e a trilha de auditoria fica intacta", async () => {
    const actor = await makeUser("USER", "ator");
    const log = await ownerDb.auditLog.create({ data: { clientId: w.clientA, actorId: actor.id, action: "b1.ator", entityType: "client", entityId: w.clientA } });
    await expect(withSystem(appDb, systemContextForSeed(), (tx) => tx.user.delete({ where: { id: actor.id } }))).rejects.toThrow(/permission denied/i);
    expect((await ownerDb.auditLog.findUniqueOrThrow({ where: { id: log.id } })).actorId).toBe(actor.id);
    expect(await ownerDb.user.findUnique({ where: { id: actor.id } })).not.toBeNull();
  });

  it("nem o dono do banco reescreve a auditoria: DELETE do autor, do cliente, UPDATE e TRUNCATE sao recusados", async () => {
    const actor = await makeUser("USER", "ator-dono");
    const client = await makeClient("Auditado");
    const log = await ownerDb.auditLog.create({ data: { clientId: client, actorId: actor.id, action: "b1.dono", entityType: "client", entityId: client } });
    // A acao referencial (FK ON DELETE SET NULL) e um UPDATE disfarcado: o gatilho tambem a recusa.
    await expect(ownerDb.user.delete({ where: { id: actor.id } })).rejects.toThrow(/append-only/i);
    await expect(ownerDb.client.delete({ where: { id: client } })).rejects.toThrow(/append-only/i);
    await expect(ownerDb.auditLog.update({ where: { id: log.id }, data: { actorId: null } })).rejects.toThrow(/append-only/i);
    await expect(ownerDb.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/i);
    await expect(ownerDb.$executeRawUnsafe("TRUNCATE audit_logs CASCADE")).rejects.toThrow(/append-only/i);
    const intact = await ownerDb.auditLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(intact.actorId).toBe(actor.id);
    expect(intact.clientId).toBe(client);
    expect(await ownerDb.user.findUnique({ where: { id: actor.id } })).not.toBeNull();
    expect(await ownerDb.client.findUnique({ where: { id: client } })).not.toBeNull();
  });

  // A-5: ENABLE ALWAYS. Limite aceito: superusuario ainda pode DISABLE/DROP TRIGGER ou usar replicacao logica.
  it("os gatilhos da auditoria sao ENABLE ALWAYS e valem ate com session_replication_role = replica", async () => {
    const triggers = await ownerDb.$queryRaw<{ tgname: string; tgenabled: string }[]>`
      SELECT tgname::text AS tgname, tgenabled::text AS tgenabled FROM pg_trigger WHERE tgrelid = 'audit_logs'::regclass AND tgname IN ('audit_logs_no_change', 'audit_logs_no_truncate') ORDER BY tgname`;
    expect(triggers).toEqual([
      { tgname: "audit_logs_no_change", tgenabled: "A" },
      { tgname: "audit_logs_no_truncate", tgenabled: "A" },
    ]);
    const actor = await makeUser("USER", "ator-replica");
    const log = await ownerDb.auditLog.create({ data: { clientId: w.clientA, actorId: actor.id, action: "a5.replica", entityType: "client" } });
    // Com a replicacao "replica", gatilhos ENABLE ORIGIN nao disparariam.
    await expect(
      ownerDb.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
        await tx.$executeRawUnsafe(`UPDATE audit_logs SET actor_id = NULL WHERE id = '${log.id}'`);
      }),
    ).rejects.toThrow(/append-only/i);
    expect((await ownerDb.auditLog.findUniqueOrThrow({ where: { id: log.id } })).actorId).toBe(actor.id);
  });

  it("cliente nao pode ser apagado pelo app (sem DELETE no GRANT)", async () => {
    await expect(withTenant(appDb, ctxA, ({ tx }) => tx.client.delete({ where: { id: w.clientA } }))).rejects.toThrow(/permission denied/i);
  });

  it("o escopo de sistema enxerga os dois clientes (so criado por fluxos autorizados)", async () => {
    const todos = await withSystem(appDb, systemContextForSeed(), (tx) =>
      tx.client.findMany({ where: { id: { in: [w.clientA, w.clientB] } } }),
    );
    expect(todos).toHaveLength(2);
  });

  it("o contexto de cliente nao vaza para a proxima transacao da mesma conexao", async () => {
    await withTenant(appDb, ctxA, ({ tx }) => tx.clientMember.findMany());
    expect(await appDb.clientMember.findMany()).toEqual([]);
    const [{ valor }] = await appDb.$queryRaw<{ valor: string | null }[]>`SELECT current_setting('app.client_id', true) AS valor`;
    expect(valor ?? "").toBe("");
  });
});
