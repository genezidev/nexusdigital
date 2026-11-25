import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveTenantContext, type TenantContext } from "@/server/authorization/context";
import { withTenant } from "@/server/db/scope";
import { decideApproval } from "@/server/services/contents";
import { appDb, makeWorld, ownerDb, type World } from "./helpers/world";
import { makeAwaitingContent, makeCollaboratorWithApproval, makePhase2, sys, type Phase2Data } from "./helpers/phase2";

// Correcoes da revisao independente de seguranca da fase 2 que sao do BANCO (migration 20261125140000):
// B-1 (cliente nao muda status sem decisao), B-2 (cliente nao escreve papel, permissoes e status do membro),
// extra (gatilhos ENABLE ALWAYS) e a tabela de instalacao usada pela limpeza (M-A). Tudo por SQL direto,
// como a conexao do app (papel nexo_app, sujeito a RLS), que e o que um SQL injetado alcancaria.

let w: World;
let p2: Phase2Data;
let admin: TenantContext;
let owner: TenantContext;
let collab: TenantContext;
let collabWithGrant: TenantContext;

const sql = (ctx: TenantContext, text: string) => withTenant(appDb, ctx, ({ tx }) => tx.$executeRawUnsafe(text));
const statusOf = async (id: string) => (await ownerDb.content.findUniqueOrThrow({ where: { id } })).status;
const memberOf = (userId: string) => ownerDb.clientMember.findFirstOrThrow({ where: { clientId: w.clientA, userId } });

beforeAll(async () => {
  w = await makeWorld();
  p2 = await makePhase2(w.clientA, w.admin.id, w.ownerA.id);
  const grantee = await makeCollaboratorWithApproval(w.clientA);
  admin = await resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: w.clientA });
  owner = await resolveTenantContext(appDb, { userId: w.ownerA.id, activeClientId: w.clientA });
  collab = await resolveTenantContext(appDb, { userId: w.collabA.id, activeClientId: w.clientA });
  collabWithGrant = await resolveTenantContext(appDb, { userId: grantee.id, activeClientId: w.clientA });
});

const insertApproval = (ctx: TenantContext, awaiting: { contentId: string; versionId: string }, decision: "APROVADO" | "REVISAO_SOLICITADA") =>
  sql(
    ctx,
    `INSERT INTO approvals (client_id, content_id, version_id, decision, author_id) VALUES ('${w.clientA}', '${awaiting.contentId}', '${awaiting.versionId}', '${decision}', '${ctx.userId}')`,
  );

describe("B-1: o cliente so muda o status do conteudo com uma decisao ativa dele sobre a versao atual", () => {
  it("UPDATE direto de AGUARDANDO_APROVACAO para APROVADO ou EM_REVISAO, sem linha em approvals, e recusado", async () => {
    const c = await makeAwaitingContent(w.clientA, p2.cycleId, w.admin.id);
    await expect(sql(owner, `UPDATE contents SET status = 'APROVADO' WHERE id = '${c.contentId}'`)).rejects.toThrow(/decis/i);
    await expect(sql(owner, `UPDATE contents SET status = 'EM_REVISAO' WHERE id = '${c.contentId}'`)).rejects.toThrow(/decis/i);
    expect(await statusOf(c.contentId)).toBe("AGUARDANDO_APROVACAO");
    expect(await ownerDb.approval.count({ where: { contentId: c.contentId } })).toBe(0);
  });

  it("a decisao tem de ser do mesmo usuario, da versao atual, do mesmo tipo e feita na mesma operacao", async () => {
    // decisao de OUTRA pessoa (colaborador com concessao) nao autoriza o dono a mudar o status
    const a = await makeAwaitingContent(w.clientA, p2.cycleId, w.admin.id);
    await insertApproval(collabWithGrant, a, "APROVADO");
    await expect(sql(owner, `UPDATE contents SET status = 'APROVADO' WHERE id = '${a.contentId}'`)).rejects.toThrow(/decis/i);
    expect(await statusOf(a.contentId)).toBe("AGUARDANDO_APROVACAO");

    // decisao de revisao nao autoriza APROVADO (e a unica coisa que autoriza e EM_REVISAO)
    const b = await makeAwaitingContent(w.clientA, p2.cycleId, w.admin.id);
    await withTenant(appDb, owner, async ({ tx }) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO approvals (client_id, content_id, version_id, decision, comment, author_id) VALUES ('${w.clientA}', '${b.contentId}', '${b.versionId}', 'REVISAO_SOLICITADA', 'ajustar a legenda', '${owner.userId}')`,
      );
      await expect(tx.$executeRawUnsafe(`UPDATE contents SET status = 'APROVADO' WHERE id = '${b.contentId}'`)).rejects.toThrow(/decis/i);
    });

    // decisao antiga (de uma transacao anterior) nao autoriza: precisa ser desta operacao
    const c = await makeAwaitingContent(w.clientA, p2.cycleId, w.admin.id);
    await insertApproval(owner, c, "APROVADO"); // grava e confirma, mas o status nao muda
    expect(await statusOf(c.contentId)).toBe("AGUARDANDO_APROVACAO");
    await expect(sql(owner, `UPDATE contents SET status = 'APROVADO' WHERE id = '${c.contentId}'`)).rejects.toThrow(/decis/i);
  });

  it("controle: o fluxo real (decideApproval) continua aprovando e pedindo revisao; a decisao e o status andam juntos", async () => {
    const ok = await makeAwaitingContent(w.clientA, p2.cycleId, w.admin.id);
    await decideApproval(appDb, owner, { contentId: ok.contentId, versionId: ok.versionId, decision: "APROVADO" });
    expect(await statusOf(ok.contentId)).toBe("APROVADO");
    const rev = await makeAwaitingContent(w.clientA, p2.cycleId, w.admin.id);
    await decideApproval(appDb, owner, { contentId: rev.contentId, versionId: rev.versionId, decision: "REVISAO_SOLICITADA", comment: "ajustar a legenda" });
    expect(await statusOf(rev.contentId)).toBe("EM_REVISAO");
    // a mesma operacao feita na mao, com decisao e UPDATE na mesma transacao, tambem passa (e a regra, nao um atalho)
    const manual = await makeAwaitingContent(w.clientA, p2.cycleId, w.admin.id);
    await withTenant(appDb, owner, async ({ tx }) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO approvals (client_id, content_id, version_id, decision, author_id) VALUES ('${w.clientA}', '${manual.contentId}', '${manual.versionId}', 'APROVADO', '${owner.userId}')`,
      );
      await tx.$executeRawUnsafe(`UPDATE contents SET status = 'APROVADO' WHERE id = '${manual.contentId}'`);
    });
    expect(await statusOf(manual.contentId)).toBe("APROVADO");
  });

  it("a agencia continua mudando o status sem decisao (o gatilho e so do lado do cliente)", async () => {
    const c = await makeAwaitingContent(w.clientA, p2.cycleId, w.admin.id);
    await sql(admin, `UPDATE contents SET status = 'EM_PRODUCAO' WHERE id = '${c.contentId}'`);
    expect(await statusOf(c.contentId)).toBe("EM_PRODUCAO");
  });

  it("colaborador SEM content:approve nao grava decisao nem por SQL; o dono e o colaborador com concessao gravam", async () => {
    const c = await makeAwaitingContent(w.clientA, p2.cycleId, w.admin.id);
    await expect(insertApproval(collab, c, "APROVADO")).rejects.toThrow(/content:approve|permiss/i);
    expect(await ownerDb.approval.count({ where: { contentId: c.contentId } })).toBe(0);
    await insertApproval(collabWithGrant, c, "APROVADO");
    expect(await ownerDb.approval.count({ where: { contentId: c.contentId } })).toBe(1);
    // membro desativado perde a concessao
    const d = await makeAwaitingContent(w.clientA, p2.cycleId, w.admin.id);
    await ownerDb.clientMember.updateMany({ where: { clientId: w.clientA, userId: collabWithGrant.userId }, data: { status: "REVOKED" } });
    try {
      await expect(insertApproval(collabWithGrant, d, "APROVADO")).rejects.toThrow();
    } finally {
      await ownerDb.clientMember.updateMany({ where: { clientId: w.clientA, userId: collabWithGrant.userId }, data: { status: "ACTIVE" } });
    }
  });
});

describe("B-2: o cliente nao escreve papel, permissoes nem status de membro (nem cria ou apaga membro)", () => {
  it("colaborador nao vira dono nem concede a si a permissao de aprovar", async () => {
    const before = await memberOf(w.collabA.id);
    await expect(sql(collab, `UPDATE client_members SET role = 'CLIENT_OWNER' WHERE user_id = '${w.collabA.id}'`)).rejects.toThrow(/membro|admin/i);
    await expect(sql(collab, `UPDATE client_members SET permissions = ARRAY['content:approve'] WHERE user_id = '${w.collabA.id}'`)).rejects.toThrow(/membro|admin/i);
    await expect(sql(collab, `UPDATE client_members SET status = 'REVOKED' WHERE user_id = '${w.ownerA.id}'`)).rejects.toThrow(/membro|admin/i);
    const after = await memberOf(w.collabA.id);
    expect(after.role).toBe(before.role);
    expect(after.permissions).toEqual(before.permissions);
    expect((await memberOf(w.ownerA.id)).status).toBe("ACTIVE");
  });

  it("o dono do cliente nao muda papel de ninguem; criar e apagar membro por SQL do cliente e recusado (D-0026 so abre permissoes e acesso de colaborador)", async () => {
    await expect(sql(owner, `UPDATE client_members SET role = 'CLIENT_OWNER' WHERE user_id = '${w.collabA.id}'`)).rejects.toThrow(/membro|admin/i);
    await expect(sql(owner, `DELETE FROM client_members WHERE user_id = '${w.collabA.id}'`)).rejects.toThrow(/membro|admin/i);
    await expect(
      sql(owner, `INSERT INTO client_members (client_id, user_id, role) VALUES ('${w.clientA}', '${w.ownerB.id}', 'CLIENT_OWNER')`),
    ).rejects.toThrow(/membro|admin/i);
    expect(await ownerDb.clientMember.count({ where: { clientId: w.clientA, userId: w.ownerB.id } })).toBe(0);
    expect(await ownerDb.clientMember.count({ where: { clientId: w.clientA, userId: w.collabA.id } })).toBe(1);
  });

  it("controle: o ADMIN (e o escopo de sistema do aceite de convite) continuam escrevendo membros", async () => {
    const m = await memberOf(w.collabA.id);
    await sql(admin, `UPDATE client_members SET status = 'REVOKED' WHERE id = '${m.id}'`);
    expect((await memberOf(w.collabA.id)).status).toBe("REVOKED");
    await sql(admin, `UPDATE client_members SET status = 'ACTIVE' WHERE id = '${m.id}'`);
    expect((await memberOf(w.collabA.id)).status).toBe("ACTIVE");
    // a STAFF atribuida nao e admin: tambem nao escreve
    const staff = await resolveTenantContext(appDb, { userId: w.staffAssignedA.id, activeClientId: w.clientA });
    await expect(sql(staff, `UPDATE client_members SET role = 'CLIENT_OWNER' WHERE user_id = '${w.collabA.id}'`)).rejects.toThrow(/membro|admin/i);
  });

  it("o cliente tambem nao fabrica convite (que viraria um novo dono por SQL)", async () => {
    const hash = randomBytes(32).toString("hex");
    await expect(
      sql(
        owner,
        `INSERT INTO invitations (client_id, email, role, token_hash, expires_at, invited_by_id) VALUES ('${w.clientA}', 'forjado@teste.test', 'CLIENT_OWNER', '${hash}', now() + interval '1 day', '${w.ownerA.id}')`,
      ),
    ).rejects.toThrow(/convite|admin/i);
    await expect(sql(owner, `UPDATE invitations SET role = 'CLIENT_OWNER' WHERE id = '${w.invitationA}'`)).rejects.toThrow(/convite|admin/i);
    // controle: o ADMIN cria e revoga convite normalmente
    await sql(admin, `UPDATE invitations SET revoked_at = now() WHERE id = '${w.invitationA}'`);
  });
});

describe("gatilhos de regra valem tambem com session_replication_role = replica (ENABLE ALWAYS)", () => {
  it("todo gatilho de usuario do esquema public tem tgenabled = 'A', e a lista nomeia os da fase 2", async () => {
    const rows = await ownerDb.$queryRaw<{ tgname: string; tgenabled: string }[]>`
      SELECT tgname::text AS tgname, tgenabled::text AS tgenabled FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE NOT t.tgisinternal AND n.nspname = 'public' ORDER BY tgname`;
    const wanted = [
      "contents_guard",
      "assets_guard",
      "asset_links_guard",
      "recordings_guard",
      "subscriptions_guard",
      "editorial_cycles_guard",
      "service_plans_guard",
      "contents_invalidate_approvals",
      "client_members_role_check",
      "contents_client_decision_guard",
      "approvals_client_permission_guard",
      "client_members_admin_only",
      "invitations_admin_only",
      "media_links_guard",
    ];
    const byName = new Map(rows.map((r) => [r.tgname, r.tgenabled]));
    for (const name of wanted) expect(byName.get(name), name).toBe("A");
    expect(rows.filter((r) => r.tgenabled !== "A").map((r) => r.tgname)).toEqual([]);
  });

  it("com session_replication_role = replica o gatilho de conteudo ainda recusa (prova funcional)", async () => {
    const c = await makeAwaitingContent(w.clientA, p2.cycleId, w.admin.id);
    await expect(
      ownerDb.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
        await tx.$executeRawUnsafe("SELECT set_config('app.system', 'on', true)");
        await tx.$executeRawUnsafe(`UPDATE contents SET current_version_id = NULL WHERE id = '${c.contentId}'`);
      }),
    ).rejects.toThrow(/versao atual/i);
  });
});

describe("instalacao: identificador gravado no banco pela migration", () => {
  it("existe exatamente um installation_id, o app so le e cria (nunca altera nem apaga) e so em escopo de sistema", async () => {
    const rows = await ownerDb.$queryRaw<{ key: string; value: string }[]>`SELECT key, value FROM app_settings WHERE key = 'installation_id'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    // sem escopo de sistema (sessao de cliente) nada aparece e nada se grava
    await withTenant(appDb, owner, async ({ tx }) => {
      expect(await tx.$queryRawUnsafe("SELECT 1 FROM app_settings")).toEqual([]);
      await expect(tx.$executeRawUnsafe("INSERT INTO app_settings (key, value) VALUES ('x_teste', 'y')")).rejects.toThrow(/row-level security/i);
    });
    await expect(appDb.$executeRawUnsafe("UPDATE app_settings SET value = 'x'")).rejects.toThrow(/permission denied/i);
    await expect(appDb.$executeRawUnsafe("DELETE FROM app_settings")).rejects.toThrow(/permission denied/i);
  });
});

describe("funcoes de capacidade (SECURITY DEFINER, so devolvem um numero)", () => {
  const since = "now() - interval '24 hours'";

  it("client_storage_bytes: o cliente so pergunta pelo PROPRIO cliente (outro cliente = erro), e soma o que a RLS esconde dele", async () => {
    const own = await withTenant(appDb, owner, ({ tx }) => tx.$queryRawUnsafe<{ total: bigint }[]>(`SELECT client_storage_bytes('${w.clientA}'::uuid, ${since}) AS total`));
    const real = await ownerDb.asset.aggregate({
      where: { clientId: w.clientA, OR: [{ status: "DISPONIVEL" }, { status: "PENDENTE", createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } }] },
      _sum: { bytes: true },
    });
    expect(BigInt(own[0].total)).toBe(real._sum.bytes ?? BigInt(0));
    // o cliente nao ve a linha INTERNA da agencia, mas ela esta na soma
    const visible = await withTenant(appDb, owner, ({ tx }) => tx.asset.aggregate({ where: { clientId: w.clientA, status: "DISPONIVEL" }, _sum: { bytes: true } }));
    expect(BigInt(own[0].total) >= (visible._sum.bytes ?? BigInt(0))).toBe(true);
    await expect(withTenant(appDb, owner, ({ tx }) => tx.$queryRawUnsafe(`SELECT client_storage_bytes('${w.clientB}'::uuid, ${since})`))).rejects.toThrow(/so o cliente da sessao/);
  });

  it("storage_bytes_total: so em escopo de sistema; a sessao de cliente ou de agencia recebe erro", async () => {
    await expect(withTenant(appDb, owner, ({ tx }) => tx.$queryRawUnsafe(`SELECT storage_bytes_total(${since})`))).rejects.toThrow(/so o escopo de sistema/);
    await expect(withTenant(appDb, admin, ({ tx }) => tx.$queryRawUnsafe(`SELECT storage_bytes_total(${since})`))).rejects.toThrow(/so o escopo de sistema/);
    const total = await sys((tx) => tx.$queryRawUnsafe<{ total: bigint }[]>(`SELECT storage_bytes_total(${since}) AS total`));
    const real = await ownerDb.asset.aggregate({
      where: { OR: [{ status: "DISPONIVEL" }, { status: "PENDENTE", createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } }] },
      _sum: { bytes: true },
    });
    expect(BigInt(total[0].total)).toBe(real._sum.bytes ?? BigInt(0));
  });
});
