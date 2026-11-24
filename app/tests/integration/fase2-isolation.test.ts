import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveTenantContext, systemContextForAdmin, systemContextForStaffArea, type TenantContext } from "@/server/authorization/context";
import type { Db } from "@/server/db/client";
import { withSystemScoped, withTenant } from "@/server/db/scope";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { getAsset, listLinks, removeLink } from "@/server/repositories/assets";
import { getCycle, updateCycle } from "@/server/repositories/cycles";
import { getContent, getVersion, listApprovals, listComments, listContents, listVersions, updateContent } from "@/server/repositories/contents";
import { getPlan, listPlans } from "@/server/repositories/plans";
import { getRecording, getScript, listRecordings, listScripts, updateScript } from "@/server/repositories/scripts";
import { getSubscription, listSubscriptions, updateSubscription } from "@/server/repositories/subscriptions";
import { resolveAdminClientContext } from "@/server/services/access";
import { appDb, makeWorld, ownerDb, type World } from "./helpers/world";
import { makePhase2, makeStaffAssigned, sys, type Phase2Data } from "./helpers/phase2";

// Isolamento A x B para TODAS as tabelas novas, nas duas conexoes (como na fase 1):
//  - app: papel nexo_app, RLS ligada; protege codigo E banco.
//  - dono: superusuario, ignora RLS; so o filtro do repositorio protege.
describe.each<[string, Db]>([
  ["conexao do app (RLS + filtro no codigo)", appDb],
  ["conexao do dono (somente o filtro no codigo)", ownerDb],
])("fase 2, isolamento entre clientes: %s", (_n, db) => {
  let w: World;
  let a: Phase2Data;
  let b: Phase2Data;
  let adminA: TenantContext;
  let ownerA: TenantContext;

  beforeAll(async () => {
    w = await makeWorld();
    a = await makePhase2(w.clientA, w.admin.id, w.ownerA.id);
    b = await makePhase2(w.clientB, w.admin.id, w.ownerB.id);
    adminA = await resolveTenantContext(db, { userId: w.admin.id, activeClientId: w.clientA });
    ownerA = await resolveTenantContext(db, { userId: w.ownerA.id, activeClientId: w.clientA });
  });

  it("assinatura e ciclo: nao le, nao lista, nao altera os do B", async () => {
    await withTenant(db, adminA, async (s) => {
      expect(await getSubscription(s, b.subscriptionId)).toBeNull();
      expect((await listSubscriptions(s)).every((x) => x.clientId === w.clientA)).toBe(true);
      expect(await updateSubscription(s, b.subscriptionId, { status: "ENCERRADA" })).toBe(0);
      expect(await getCycle(s, b.cycleId)).toBeNull();
      expect(await updateCycle(s, b.cycleId, { quota: 99 })).toBe(0);
    });
    expect((await ownerDb.subscription.findUniqueOrThrow({ where: { id: b.subscriptionId } })).status).toBe("ATIVA");
    expect((await ownerDb.editorialCycle.findUniqueOrThrow({ where: { id: b.cycleId } })).quota).toBe(12);
  });

  it("conteudo, versao, aprovacao e comentario: nao le, nao lista, nao altera os do B", async () => {
    await withTenant(db, adminA, async (s) => {
      expect(await getContent(s, b.contentShared)).toBeNull();
      expect((await listContents(s)).every((c) => c.clientId === w.clientA)).toBe(true);
      expect(await updateContent(s, b.contentShared, { title: "INVADIDO" })).toBe(0);
      expect(await getVersion(s, b.versionSent)).toBeNull();
      expect(await listVersions(s, b.contentShared)).toEqual([]);
      expect(await listApprovals(s, b.contentShared)).toEqual([]);
      expect(await listComments(s, { contentId: b.contentShared })).toEqual([]);
      // do proprio A funciona (o teste nao passa por estar tudo bloqueado)
      expect(await getContent(s, a.contentShared)).not.toBeNull();
      expect((await listVersions(s, a.contentShared)).length).toBeGreaterThan(0);
      expect((await listComments(s, { contentId: a.contentShared })).length).toBeGreaterThan(0);
    });
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: b.contentShared } })).title).not.toBe("INVADIDO");
  });

  it("roteiro, gravacao e arquivo: nao le, nao lista, nao altera os do B", async () => {
    await withTenant(db, adminA, async (s) => {
      expect(await getScript(s, b.scriptSent)).toBeNull();
      expect((await listScripts(s)).every((x) => x.clientId === w.clientA)).toBe(true);
      expect(await updateScript(s, b.scriptSent, { title: "INVADIDO" })).toBe(0);
      expect(await getRecording(s, b.recording)).toBeNull();
      expect(await listRecordings(s, b.scriptSent)).toEqual([]);
      expect(await getAsset(s, b.assetAvailable)).toBeNull();
      expect(await listLinks(s, { versionId: b.versionDraft })).toEqual([]);
      expect(await removeLink(s, b.link)).toBe(0);
      expect(await getScript(s, a.scriptSent)).not.toBeNull();
      expect(await getAsset(s, a.assetAvailable)).not.toBeNull();
    });
    expect(await ownerDb.assetLink.findUnique({ where: { id: b.link } })).not.toBeNull();
  });

  it("o cliente (dono do A) tambem nao alcanca nada do B por id", async () => {
    await withTenant(db, ownerA, async (s) => {
      expect(await getContent(s, b.contentShared)).toBeNull();
      expect(await getVersion(s, b.versionSent)).toBeNull();
      expect(await getScript(s, b.scriptSent)).toBeNull();
      expect(await getAsset(s, b.assetAvailable)).toBeNull();
      expect(await getSubscription(s, b.subscriptionId)).toBeNull();
    });
  });

  it("STAFF atribuido so ao B (contexto do B) nao enxerga as linhas do A", async () => {
    const staffB = await makeStaffAssigned(w.clientB, "staff-b");
    const ctxB = await resolveTenantContext(db, { userId: staffB.id, activeClientId: w.clientB });
    await withTenant(db, ctxB, async (s) => {
      expect(await getContent(s, a.contentShared)).toBeNull();
      expect(await getScript(s, a.scriptSent)).toBeNull();
      expect(await getAsset(s, a.assetAvailable)).toBeNull();
      expect(await getContent(s, b.contentShared)).not.toBeNull();
    });
  });

  it("STAFF nao atribuido recebe 404 (mesmo erro de cliente inexistente) e nao ganha contexto", async () => {
    const unassigned = { userId: w.staffUnassigned.id, role: "STAFF" as const, name: "x", email: w.staffUnassigned.email };
    await expect(resolveAdminClientContext(db, unassigned, w.clientA)).rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveAdminClientContext(db, unassigned, randomUUID())).rejects.toBeInstanceOf(NotFoundError);
    await expect(resolveTenantContext(db, { userId: w.staffUnassigned.id, activeClientId: w.clientA })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("catalogo de planos: admin e staff leem; o cliente nunca chega ao catalogo", async () => {
    const adminSys = await systemContextForAdmin(db, w.admin.id);
    const plans = await withSystemScoped(db, adminSys, (s) => listPlans(s));
    expect(plans.length).toBeGreaterThan(0);
    const staffSys = await systemContextForStaffArea(db, w.staffAssignedA.id);
    expect((await withSystemScoped(db, staffSys, (s) => getPlan(s, a.planId)))?.id).toBe(a.planId);
    await expect(systemContextForStaffArea(db, w.ownerA.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(systemContextForAdmin(db, w.staffAssignedA.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

// ---- Segunda camada: o codigo do repositorio e IGNORADO de proposito (consultas cruas) ----
describe("fase 2, RLS no PostgreSQL (papel nexo_app, consultas cruas)", () => {
  let w: World;
  let a: Phase2Data;
  let b: Phase2Data;
  let adminA: TenantContext;
  let ownerA: TenantContext;
  const TABLES = ["subscriptions", "editorial_cycles", "contents", "content_versions", "approvals", "comments", "scripts", "script_scenes", "recordings", "assets", "asset_links"];

  beforeAll(async () => {
    w = await makeWorld();
    a = await makePhase2(w.clientA, w.admin.id, w.ownerA.id);
    b = await makePhase2(w.clientB, w.admin.id, w.ownerB.id);
    adminA = await resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: w.clientA });
    ownerA = await resolveTenantContext(appDb, { userId: w.ownerA.id, activeClientId: w.clientA });
  });

  it("sem contexto, nenhuma tabela de cliente devolve linha (nega por padrao)", async () => {
    for (const t of TABLES) {
      const rows = await appDb.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${t}`);
      expect(Number(rows[0].n), t).toBe(0);
    }
    expect(await appDb.servicePlan.findMany()).toEqual([]);
  });

  it("select cru, sem where, no escopo do A: so linhas do A em TODAS as tabelas novas", async () => {
    await withTenant(appDb, adminA, async ({ tx }) => {
      for (const t of TABLES) {
        const rows = await tx.$queryRawUnsafe<{ client_id: string }[]>(`SELECT client_id FROM ${t}`);
        expect(rows.length, t).toBeGreaterThan(0);
        expect(rows.every((r) => r.client_id === w.clientA), t).toBe(true);
      }
    });
  });

  it("update e delete crus em linha do B afetam 0 linhas (todas as tabelas com UPDATE/DELETE no GRANT)", async () => {
    await withTenant(appDb, adminA, async ({ tx }) => {
      const upd: [string, string, string][] = [
        ["subscriptions", "billing_day = 11", b.subscriptionId],
        ["editorial_cycles", "quota = 1", b.cycleId],
        ["contents", "internal_notes = 'x'", b.contentShared],
        ["content_versions", "caption = 'x'", b.versionDraft],
        ["scripts", "title = 'x'", b.scriptSent],
        ["recordings", "feedback = 'x'", b.recording],
        ["assets", "visibility = 'INTERNO'", b.assetAvailable],
        ["asset_links", "position = 3", b.link],
        ["script_scenes", "action = 'x'", b.scene],
      ];
      for (const [t, set, id] of upd) expect(await tx.$executeRawUnsafe(`UPDATE ${t} SET ${set} WHERE id = '${id}'`), `update ${t}`).toBe(0);
      expect(await tx.$executeRawUnsafe(`DELETE FROM asset_links WHERE id = '${b.link}'`)).toBe(0);
      expect(await tx.$executeRawUnsafe(`DELETE FROM script_scenes WHERE id = '${b.scene}'`)).toBe(0);
      expect(await tx.$executeRawUnsafe(`UPDATE approvals SET invalidated_at = now(), invalidation_reason = 'x' WHERE id = '${b.approval}'`)).toBe(0);
    });
    expect((await ownerDb.subscription.findUniqueOrThrow({ where: { id: b.subscriptionId } })).billingDay).toBe(10);
    expect(await ownerDb.scriptScene.findUnique({ where: { id: b.scene } })).not.toBeNull();
    expect((await ownerDb.approval.findUniqueOrThrow({ where: { id: b.approval } })).invalidatedAt).toBeNull();
  });

  it("inserir linha do B no escopo do A e recusado pelo banco (RLS) em cada tabela", async () => {
    const fail = (fn: (tx: Parameters<Parameters<typeof withTenant>[2]>[0]["tx"]) => Promise<unknown>) =>
      expect(withTenant(appDb, adminA, ({ tx }) => fn(tx))).rejects.toThrow(/row-level security|violates|Foreign key|foreign key/i);
    await fail((tx) => tx.subscription.create({ data: { clientId: w.clientB, planId: a.planId, planCode: "x-y", planName: "x", planVersion: 1, scopeSnapshot: "x", amountCents: 1, quota: 1, revisionsPerPiece: 1, approvalDeadlineBusinessDays: 1, startsOn: new Date(), billingDay: 1 } }));
    await fail((tx) => tx.editorialCycle.create({ data: { clientId: w.clientB, subscriptionId: b.subscriptionId, year: 2027, month: 1, quota: 1 } }));
    await fail((tx) => tx.content.create({ data: { clientId: w.clientB, cycleId: b.cycleId, title: "invasor", format: "ARTE", plannedOn: new Date("2026-11-10T00:00:00Z") } }));
    await fail((tx) => tx.script.create({ data: { clientId: w.clientB, title: "invasor" } }));
    await fail((tx) => tx.comment.create({ data: { clientId: w.clientB, contentId: b.contentShared, authorId: w.admin.id, body: "invasor", visibility: "INTERNO" } }));
    await fail((tx) => tx.asset.create({ data: { clientId: w.clientB, storageKey: `clients/${w.clientB}/${randomUUID()}`, originalName: "x.png", uploadedById: w.admin.id } }));
  });

  it("mover linha do A para o B (UPDATE client_id) e recusado", async () => {
    await expect(withTenant(appDb, adminA, ({ tx }) => tx.content.update({ where: { id: a.contentInternal }, data: { clientId: w.clientB } }))).rejects.toThrow();
    await expect(withTenant(appDb, adminA, ({ tx }) => tx.script.update({ where: { id: a.scriptSent }, data: { clientId: w.clientB } }))).rejects.toThrow();
  });

  it("o papel do app nao tem DELETE onde o historico precisa ser preservado", async () => {
    for (const t of ["subscriptions", "editorial_cycles", "contents", "content_versions", "approvals", "comments", "scripts", "recordings", "assets", "service_plans"]) {
      await expect(withTenant(appDb, adminA, ({ tx }) => tx.$executeRawUnsafe(`DELETE FROM ${t} WHERE false`)), t).rejects.toThrow(/permission denied/i);
    }
  });

  it("service_plans: o contexto de cliente nao le nem escreve; staff le e nao escreve; so ADMIN escreve", async () => {
    await withTenant(appDb, ownerA, async ({ tx }) => {
      expect(await tx.servicePlan.findMany()).toEqual([]);
    });
    await expect(
      withTenant(appDb, ownerA, ({ tx }) => tx.servicePlan.create({ data: { code: `x-${randomUUID().slice(0, 6)}`, version: 1, name: "n", monthlyAmountCents: 1, monthlyQuota: 1, revisionsPerPiece: 1, approvalDeadlineBusinessDays: 1, scope: "s" } })),
    ).rejects.toThrow(/row-level security/i);
    const staffCtx = await resolveTenantContext(appDb, { userId: w.staffAssignedA.id, activeClientId: w.clientA });
    await withTenant(appDb, staffCtx, async ({ tx }) => {
      expect((await tx.servicePlan.findMany()).length).toBeGreaterThan(0);
    });
    await expect(
      withTenant(appDb, staffCtx, ({ tx }) => tx.servicePlan.create({ data: { code: `x-${randomUUID().slice(0, 6)}`, version: 1, name: "n", monthlyAmountCents: 1, monthlyQuota: 1, revisionsPerPiece: 1, approvalDeadlineBusinessDays: 1, scope: "s" } })),
    ).rejects.toThrow(/row-level security/i);
    await withTenant(appDb, adminA, ({ tx }) =>
      tx.servicePlan.create({ data: { code: `ok-${randomUUID().slice(0, 6)}`, version: 1, name: "n", monthlyAmountCents: 1, monthlyQuota: 1, revisionsPerPiece: 1, approvalDeadlineBusinessDays: 1, scope: "s" } }),
    );
  });

  it("o contexto do pedido nao vaza para a proxima transacao (audience e user_id voltam ao padrao)", async () => {
    await withTenant(appDb, adminA, ({ tx }) => tx.content.findMany());
    const [r] = await appDb.$queryRaw<{ a: string; u: string | null }[]>`SELECT current_setting('app.audience', true) AS a, current_setting('app.user_id', true) AS u`;
    expect(r.a ?? "").toBe("");
    expect(r.u ?? "").toBe("");
  });
});

// ---- Chaves estrangeiras COMPOSTAS: o banco recusa ligar linhas de clientes diferentes ----
// Cada caso desliga SO o gatilho de regra da tabela (dentro da transacao, que desfaz tudo ao falhar) para provar
// que a FK composta sozinha recusa o vinculo cruzado, mesmo pela conexao do dono.
describe("fase 2, FK composta (client_id, id): vinculo cruzado falha no banco, mesmo pela conexao do dono", () => {
  let w: World;
  let a: Phase2Data;
  let b: Phase2Data;
  beforeAll(async () => {
    w = await makeWorld();
    a = await makePhase2(w.clientA, w.admin.id, w.ownerA.id);
    b = await makePhase2(w.clientB, w.admin.id, w.ownerB.id);
  });
  const FK = /foreign key constraint|violates foreign key/i;

  const onlyFk = (table: string, fn: (tx: Parameters<Parameters<typeof sys>[0]>[0]) => Promise<unknown>, triggers: string[] = []) =>
    expect(
      sys(async (tx) => {
        for (const t of triggers) await tx.$executeRawUnsafe(`ALTER TABLE ${table} DISABLE TRIGGER ${t}`);
        await fn(tx);
        // Se o banco NAO recusou, a transacao ainda desfaz tudo (nada de gatilho desligado fica para tras).
        throw new Error("NAO-RECUSOU");
      }),
    ).rejects.toThrow(FK);

  it("ciclo do A com assinatura do B", async () => {
    await onlyFk("editorial_cycles", (tx) => tx.editorialCycle.create({ data: { clientId: w.clientA, subscriptionId: b.subscriptionId, year: 2027, month: 2, quota: 1 } }));
  });
  it("conteudo do A em ciclo do B", async () => {
    await onlyFk("contents", (tx) => tx.content.create({ data: { clientId: w.clientA, cycleId: b.cycleId, title: "cruzado", format: "ARTE", plannedOn: new Date("2026-11-10T00:00:00Z") } }), ["contents_guard"]);
  });
  it("versao do A em conteudo do B", async () => {
    await onlyFk("content_versions", (tx) => tx.contentVersion.create({ data: { clientId: w.clientA, contentId: b.contentShared, number: 2, authorId: w.admin.id } }), ["content_versions_guard"]);
  });
  it("versao atual do conteudo do A apontando para versao do B", async () => {
    await onlyFk("contents", (tx) => tx.$executeRawUnsafe(`UPDATE contents SET current_version_id = '${b.versionSent}' WHERE id = '${a.contentShared}'`), ["contents_guard", "contents_invalidate_approvals"]);
  });
  it("aprovacao do A para versao do B", async () => {
    await onlyFk("approvals", (tx) => tx.approval.create({ data: { clientId: w.clientA, contentId: a.contentShared, versionId: b.versionSent, decision: "APROVADO", authorId: w.ownerA.id } }), ["approvals_guard"]);
  });
  it("comentario do A em conteudo, roteiro ou versao do B", async () => {
    await onlyFk("comments", (tx) => tx.comment.create({ data: { clientId: w.clientA, contentId: b.contentShared, authorId: w.admin.id, body: "x" } }), ["comments_guard"]);
    await onlyFk("comments", (tx) => tx.comment.create({ data: { clientId: w.clientA, scriptId: b.scriptSent, authorId: w.admin.id, body: "x" } }), ["comments_guard"]);
    await onlyFk("comments", (tx) => tx.comment.create({ data: { clientId: w.clientA, contentId: a.contentShared, versionId: b.versionSent, authorId: w.admin.id, body: "x" } }), ["comments_guard"]);
  });
  it("roteiro do A ligado a conteudo do B; cena e gravacao do A em roteiro do B", async () => {
    await onlyFk("scripts", (tx) => tx.script.create({ data: { clientId: w.clientA, contentId: b.contentShared, title: "cruzado" } }));
    await onlyFk("script_scenes", (tx) => tx.scriptScene.create({ data: { clientId: w.clientA, scriptId: b.scriptSent, position: 9 } }));
    await onlyFk("recordings", (tx) => tx.recording.create({ data: { clientId: w.clientA, scriptId: b.scriptSent, kind: "LINK", externalUrl: "https://vimeo.com/1", submittedById: w.ownerA.id } }), ["recordings_guard"]);
  });
  it("vinculo de arquivo: arquivo do A em versao, roteiro, gravacao ou conteudo do B (e vice-versa)", async () => {
    const mk = (data: object) => (tx: Parameters<Parameters<typeof sys>[0]>[0]) => tx.assetLink.create({ data: { clientId: w.clientA, assetId: a.assetAvailable, role: "FINAL", ...data } as never });
    await onlyFk("asset_links", mk({ versionId: b.versionDraft }), ["asset_links_guard"]);
    await onlyFk("asset_links", mk({ role: "PDF_ROTEIRO", scriptId: b.scriptSent }), ["asset_links_guard"]);
    await onlyFk("asset_links", mk({ role: "GRAVACAO", recordingId: b.recording }), ["asset_links_guard"]);
    await onlyFk("asset_links", mk({ role: "EVIDENCIA", contentId: b.contentShared }), ["asset_links_guard"]);
    await onlyFk("asset_links", (tx) => tx.assetLink.create({ data: { clientId: w.clientA, assetId: b.assetAvailable, versionId: a.versionDraft, role: "FINAL" } }), ["asset_links_guard"]);
  });
  it("arquivo do A com chave de armazenamento da pasta do B (CHECK)", async () => {
    await expect(
      sys((tx) => tx.asset.create({ data: { clientId: w.clientA, storageKey: `clients/${w.clientB}/${randomUUID()}`, originalName: "x.png", uploadedById: w.admin.id } })),
    ).rejects.toThrow(/assets_values_check|check constraint/i);
  });
  it("controle: com as regras ligadas, o vinculo dentro do mesmo cliente funciona", async () => {
    const extra = await sys((tx) =>
      tx.asset.create({ data: { clientId: w.clientA, storageKey: `clients/${w.clientA}/${randomUUID()}`, mimeType: "image/png", category: "IMAGEM", bytes: 10, checksumSha256: "b".repeat(64), originalName: "o.png", uploadedById: w.admin.id, status: "DISPONIVEL", finalizedAt: new Date() } }),
    );
    await sys((tx) => tx.assetLink.create({ data: { clientId: w.clientA, assetId: extra.id, versionId: a.versionDraft, role: "FINAL" } }));
  });
});
