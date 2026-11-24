import { beforeAll, describe, expect, it } from "vitest";
import { resolveTenantContext, type TenantContext } from "@/server/authorization/context";
import type { Db } from "@/server/db/client";
import { withTenant } from "@/server/db/scope";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors";
import { getAsset } from "@/server/repositories/assets";
import { getVersion, listContents, listVersions } from "@/server/repositories/contents";
import { getScript, listScripts } from "@/server/repositories/scripts";
import { addComment, decideApproval, editMaterial, getContentDetail, listContentsFor } from "@/server/services/contents";
import { getScriptDetail } from "@/server/services/scripts";
import { appDb, makeWorld, ownerDb, type World } from "./helpers/world";
import { makeAwaitingContent, makeCollaboratorWithApproval, makePhase2, sys, type Phase2Data } from "./helpers/phase2";

// ---------- Visibilidade para o cliente: nunca rascunho, nota interna nem comentario interno ----------
describe.each<[string, Db]>([
  ["conexao do app (RLS + filtro no codigo)", appDb],
  ["conexao do dono (somente o filtro no codigo)", ownerDb],
])("fase 2, visibilidade ao cliente: %s", (_n, db) => {
  let w: World;
  let a: Phase2Data;
  let owner: TenantContext;
  let collab: TenantContext;
  let admin: TenantContext;

  beforeAll(async () => {
    w = await makeWorld();
    a = await makePhase2(w.clientA, w.admin.id, w.ownerA.id);
    owner = await resolveTenantContext(db, { userId: w.ownerA.id, activeClientId: w.clientA });
    collab = await resolveTenantContext(db, { userId: w.collabA.id, activeClientId: w.clientA });
    admin = await resolveTenantContext(db, { userId: w.admin.id, activeClientId: w.clientA });
  });

  it("o cliente lista so conteudo COMPARTILHADO e nao abre o interno por id", async () => {
    const lista = await listContentsFor(db, owner);
    expect(lista.some((c) => c.id === a.contentShared)).toBe(true);
    expect(lista.some((c) => c.id === a.contentInternal)).toBe(false);
    await withTenant(db, owner, async (s) => {
      expect(await listContents(s, { cycleId: a.cycleId })).not.toContainEqual(expect.objectContaining({ id: a.contentInternal }));
    });
    await expect(getContentDetail(db, owner, a.contentInternal)).rejects.toBeInstanceOf(NotFoundError);
    // controle: a agencia ve os dois
    const todos = await listContentsFor(db, admin);
    expect(todos.map((c) => c.id)).toEqual(expect.arrayContaining([a.contentShared, a.contentInternal]));
  });

  it("varredura: nenhuma marca interna plantada aparece na resposta do portal (conteudo, versoes, aprovacoes, comentarios)", async () => {
    for (const ctx of [owner, collab]) {
      const detail = await getContentDetail(db, ctx, a.contentShared);
      const lista = await listContentsFor(db, ctx);
      const json = JSON.stringify({ detail, lista });
      for (const [name, mark] of Object.entries(a.marks)) {
        if (name === "sharedCaption" || name === "commentPublic") continue;
        expect(json.includes(mark), `${name} vazou`).toBe(false);
      }
      expect(json).not.toContain(`PILAR-${a.tag}`);
      expect(json).toContain(a.marks.sharedCaption); // controle: o que e publico aparece
      expect(json).toContain(a.marks.commentPublic);
      for (const campo of ["internalNotes", "objective", "pillar", "countsTowardQuota", "isBonus", "briefing", "cancelReason", "assigneeId"]) {
        expect(json.includes(`"${campo}"`), campo).toBe(false);
      }
    }
  });

  it("a agencia ve tudo o que o cliente nao ve (a varredura nao passa por estar vazio)", async () => {
    const detail = await getContentDetail(db, admin, a.contentShared);
    const json = JSON.stringify(detail);
    expect(json).toContain(a.marks.internalNote);
    expect(json).toContain(a.marks.commentInternal);
    expect(json).toContain(a.marks.briefing);
  });

  it("rascunho de versao nunca aparece para o cliente", async () => {
    await withTenant(db, owner, async (s) => {
      expect(await getVersion(s, a.versionDraft)).toBeNull();
      expect(await listVersions(s, a.contentInternal)).toEqual([]);
      const v = await listVersions(s, a.contentShared);
      expect(v.every((x) => x.status === "ENVIADA")).toBe(true);
    });
    expect(JSON.stringify(await listContentsFor(db, owner))).not.toContain(a.marks.draft);
  });

  it("roteiro em RASCUNHO e interno; a partir de ENVIADO o cliente ve", async () => {
    await withTenant(db, owner, async (s) => {
      expect(await getScript(s, a.scriptDraft)).toBeNull();
      expect((await listScripts(s)).map((x) => x.id)).toEqual(expect.arrayContaining([a.scriptSent]));
      expect((await listScripts(s)).some((x) => x.id === a.scriptDraft)).toBe(false);
    });
    await expect(getScriptDetail(db, owner, a.scriptDraft)).rejects.toBeInstanceOf(NotFoundError);
    expect((await getScriptDetail(db, owner, a.scriptSent)).script.id).toBe(a.scriptSent);
  });

  it("arquivo: o cliente ve o ligado a versao enviada e o proprio pendente; o colega nao ve o pendente alheio", async () => {
    await withTenant(db, owner, async (s) => {
      expect(await getAsset(s, a.assetAvailable)).not.toBeNull();
      expect(await getAsset(s, a.assetPending)).not.toBeNull(); // enviado por ele
      expect(await getAsset(s, a.assetAvailable)).not.toHaveProperty("storageKey");
    });
    await withTenant(db, collab, async (s) => {
      expect(await getAsset(s, a.assetPending)).toBeNull();
    });
  });

  it("o cliente comenta so de forma compartilhada; interno e proibido (R-2) e o comentario aparece para a agencia", async () => {
    await expect(addComment(db, owner, { contentId: a.contentShared, body: "oi", visibility: "INTERNO" })).rejects.toBeInstanceOf(ForbiddenError);
    await addComment(db, owner, { contentId: a.contentShared, body: `ok-${a.tag}`, visibility: "COMPARTILHADO" });
    expect(JSON.stringify(await getContentDetail(db, admin, a.contentShared))).toContain(`ok-${a.tag}`);
    // comentario em conteudo interno: nao encontra o alvo
    await expect(addComment(db, owner, { contentId: a.contentInternal, body: "x", visibility: "COMPARTILHADO" })).rejects.toBeInstanceOf(NotFoundError);
  });
});

// ---------- Visibilidade na RLS: consultas cruas, o codigo e ignorado ----------
describe("fase 2, visibilidade ao cliente na RLS (consultas cruas na conexao do app)", () => {
  let w: World;
  let a: Phase2Data;
  let owner: TenantContext;
  let collab: TenantContext;
  let staff: TenantContext;
  let admin: TenantContext;

  beforeAll(async () => {
    w = await makeWorld();
    a = await makePhase2(w.clientA, w.admin.id, w.ownerA.id);
    owner = await resolveTenantContext(appDb, { userId: w.ownerA.id, activeClientId: w.clientA });
    collab = await resolveTenantContext(appDb, { userId: w.collabA.id, activeClientId: w.clientA });
    staff = await resolveTenantContext(appDb, { userId: w.staffAssignedA.id, activeClientId: w.clientA });
    admin = await resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: w.clientA });
  });

  it("select cru sem filtro: o cliente so recebe o compartilhado, so versao enviada, so comentario publico, so roteiro enviado", async () => {
    await withTenant(appDb, owner, async ({ tx }) => {
      const contents = await tx.$queryRawUnsafe<{ visibility: string }[]>("SELECT visibility FROM contents");
      expect(contents.length).toBeGreaterThan(0);
      expect(contents.every((c) => c.visibility === "COMPARTILHADO")).toBe(true);
      const versions = await tx.$queryRawUnsafe<{ status: string }[]>("SELECT status FROM content_versions");
      expect(versions.length).toBeGreaterThan(0);
      expect(versions.every((v) => v.status === "ENVIADA")).toBe(true);
      const comments = await tx.$queryRawUnsafe<{ visibility: string }[]>("SELECT visibility FROM comments");
      expect(comments.length).toBeGreaterThan(0);
      expect(comments.every((c) => c.visibility === "COMPARTILHADO")).toBe(true);
      const scripts = await tx.$queryRawUnsafe<{ status: string }[]>("SELECT status FROM scripts");
      expect(scripts.length).toBeGreaterThan(0);
      expect(scripts.every((c) => c.status !== "RASCUNHO")).toBe(true);
      expect(await tx.$queryRawUnsafe("SELECT 1 FROM script_scenes s WHERE s.script_id = '" + a.scriptDraft + "'")).toEqual([]);
      expect(await tx.servicePlan.findMany()).toEqual([]);
    });
    await withTenant(appDb, admin, async ({ tx }) => {
      expect((await tx.$queryRawUnsafe<{ status: string }[]>("SELECT status FROM content_versions")).some((v) => v.status === "RASCUNHO")).toBe(true);
    });
  });

  it("o cliente nao escreve em tabela de agencia: conteudo, versao, roteiro, plano, assinatura, ciclo (RLS)", async () => {
    const run = (fn: (tx: Parameters<Parameters<typeof withTenant>[2]>[0]["tx"]) => Promise<unknown>) => withTenant(appDb, owner, ({ tx }) => fn(tx));
    await expect(run((tx) => tx.content.create({ data: { clientId: w.clientA, cycleId: a.cycleId, title: "x", format: "ARTE", plannedOn: new Date("2026-11-10T00:00:00Z") } }))).rejects.toThrow(/row-level security/i);
    await expect(run((tx) => tx.contentVersion.create({ data: { clientId: w.clientA, contentId: a.contentInternal, number: 2, authorId: w.ownerA.id } }))).rejects.toThrow(/row-level security/i);
    await expect(run((tx) => tx.script.create({ data: { clientId: w.clientA, title: "x" } }))).rejects.toThrow(/row-level security/i);
    await expect(run((tx) => tx.subscription.update({ where: { id: a.subscriptionId }, data: { billingDay: 5 } }))).rejects.toThrow();
    expect(await run((tx) => tx.$executeRawUnsafe(`UPDATE editorial_cycles SET quota = 99 WHERE id = '${a.cycleId}'`))).toBe(0);
    expect(await run((tx) => tx.$executeRawUnsafe(`UPDATE scripts SET title = 'x' WHERE id = '${a.scriptSent}'`))).toBe(0);
  });

  it("o cliente so muda o STATUS de um conteudo que aguarda aprovacao; qualquer outro campo e recusado pelo banco", async () => {
    await expect(withTenant(appDb, owner, ({ tx }) => tx.$executeRawUnsafe(`UPDATE contents SET title = 'sequestrado' WHERE id = '${a.contentShared}'`))).rejects.toThrow(/so decide o status/i);
    await expect(withTenant(appDb, owner, ({ tx }) => tx.$executeRawUnsafe(`UPDATE contents SET status = 'PUBLICADO' WHERE id = '${a.contentShared}'`))).rejects.toThrow(/row-level security|violates/i);
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: a.contentShared } })).status).toBe("AGUARDANDO_APROVACAO");
  });

  it("autor da aprovacao e do comentario e sempre quem esta na sessao (RLS)", async () => {
    const fx = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
    await expect(
      withTenant(appDb, owner, ({ tx }) => tx.approval.create({ data: { clientId: w.clientA, contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO", authorId: w.collabA.id } })),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      withTenant(appDb, owner, ({ tx }) => tx.comment.create({ data: { clientId: w.clientA, contentId: fx.contentId, authorId: w.collabA.id, body: "forjado", visibility: "COMPARTILHADO" } })),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      withTenant(appDb, owner, ({ tx }) => tx.comment.create({ data: { clientId: w.clientA, contentId: fx.contentId, authorId: w.ownerA.id, body: "interno", visibility: "INTERNO" } })),
    ).rejects.toThrow(/row-level security/i);
  });

  it("ADMIN e STAFF nao aprovam em nome do cliente: nem pelo servico (403) nem pelo banco (RLS)", async () => {
    const fx = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
    for (const ctx of [admin, staff]) {
      await expect(decideApproval(appDb, ctx, { contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        withTenant(appDb, ctx, ({ tx }) => tx.approval.create({ data: { clientId: w.clientA, contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO", authorId: ctx.userId } })),
      ).rejects.toThrow(/row-level security/i);
    }
    expect(await ownerDb.approval.count({ where: { contentId: fx.contentId } })).toBe(0);
  });

  it("colaborador sem content:approve nao aprova (403); com a concessao, aprova", async () => {
    const fx = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
    await expect(decideApproval(appDb, collab, { contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO" })).rejects.toBeInstanceOf(ForbiddenError);
    const approver = await makeCollaboratorWithApproval(w.clientA);
    const ctx = await resolveTenantContext(appDb, { userId: approver.id, activeClientId: w.clientA });
    const r = await decideApproval(appDb, ctx, { contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO" });
    expect(r.replayed).toBe(false);
  });

  it("so ADMIN muda a classificacao de cota: o STAFF e recusado no codigo e no banco", async () => {
    await expect(
      withTenant(appDb, staff, ({ tx }) => tx.$executeRawUnsafe(`UPDATE contents SET counts_toward_quota = false WHERE id = '${a.contentInternal}'`)),
    ).rejects.toThrow(/so o ADMIN muda a classificacao/i);
    await withTenant(appDb, admin, ({ tx }) => tx.$executeRawUnsafe(`UPDATE contents SET counts_toward_quota = false WHERE id = '${a.contentInternal}'`));
  });
});

// ---------- Aprovacao por versao, invalidacao, concorrencia e imutabilidade ----------
describe("fase 2, aprovacao vinculada a versao", () => {
  let w: World;
  let a: Phase2Data;
  let owner: TenantContext;
  let admin: TenantContext;
  let approver: TenantContext;

  beforeAll(async () => {
    w = await makeWorld();
    a = await makePhase2(w.clientA, w.admin.id, w.ownerA.id);
    owner = await resolveTenantContext(appDb, { userId: w.ownerA.id, activeClientId: w.clientA });
    admin = await resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: w.clientA });
    const u = await makeCollaboratorWithApproval(w.clientA);
    approver = await resolveTenantContext(appDb, { userId: u.id, activeClientId: w.clientA });
  });

  it("aprovar grava versao, autor e horario do servidor; o conteudo vira APROVADO; fica auditado sem texto de comentario", async () => {
    const fx = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
    const r = await decideApproval(appDb, owner, { contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO", comment: "TEXTO-DE-COMENTARIO-SECRETO" });
    const ap = await ownerDb.approval.findUniqueOrThrow({ where: { id: r.approvalId } });
    expect(ap).toMatchObject({ versionId: fx.versionId, contentId: fx.contentId, authorId: w.ownerA.id, decision: "APROVADO", invalidatedAt: null });
    expect(Math.abs(ap.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: fx.contentId } })).status).toBe("APROVADO");
    const audit = await ownerDb.auditLog.findFirstOrThrow({ where: { action: "approval.decided", entityId: ap.id } });
    expect(audit.clientId).toBe(w.clientA);
    expect(JSON.stringify(audit.diff)).not.toContain("TEXTO-DE-COMENTARIO-SECRETO");
  });

  it("pedir revisao exige comentario e leva o conteudo a EM_REVISAO; nova versao devolve a fila", async () => {
    const fx = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
    await expect(decideApproval(appDb, owner, { contentId: fx.contentId, versionId: fx.versionId, decision: "REVISAO_SOLICITADA" })).rejects.toMatchObject({ code: "COMMENT_REQUIRED" });
    await decideApproval(appDb, owner, { contentId: fx.contentId, versionId: fx.versionId, decision: "REVISAO_SOLICITADA", comment: "ajustar a cor" });
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: fx.contentId } })).status).toBe("EM_REVISAO");
    await editMaterial(appDb, admin, fx.contentId, { caption: "nova legenda" }); // EM_REVISAO: edita o rascunho
    const { sendVersion } = await import("@/server/services/contents");
    await sendVersion(appDb, admin, fx.contentId);
    const c = await ownerDb.content.findUniqueOrThrow({ where: { id: fx.contentId } });
    expect(c.status).toBe("AGUARDANDO_APROVACAO");
    const old = await ownerDb.approval.findFirstOrThrow({ where: { versionId: fx.versionId } });
    expect(old.invalidatedAt).not.toBeNull(); // a decisao da versao 1 fica no historico, invalidada
  });

  it("segunda decisao sobre a mesma versao: 409 'ja decidida por'; a mesma pessoa repetindo recebe a mesma resposta sem linha nova", async () => {
    const fx = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
    const first = await decideApproval(appDb, owner, { contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO" });
    const again = await decideApproval(appDb, owner, { contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO" });
    expect(again).toMatchObject({ replayed: true, approvalId: first.approvalId });
    await expect(decideApproval(appDb, approver, { contentId: fx.contentId, versionId: fx.versionId, decision: "REVISAO_SOLICITADA", comment: "discordo" })).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
    await expect(decideApproval(appDb, approver, { contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO" })).rejects.toBeInstanceOf(ConflictError);
    expect(await ownerDb.approval.count({ where: { versionId: fx.versionId } })).toBe(1);
  });

  it("editar o material de um conteudo APROVADO gera versao nova, invalida a aprovacao com motivo, volta a fila e a versao antiga fica desatualizada (409)", async () => {
    const fx = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
    const ap = await decideApproval(appDb, owner, { contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO" });
    const edit = await editMaterial(appDb, admin, fx.contentId, { cta: "novo CTA" });
    expect(edit.mode).toBe("new_version_sent");
    const c = await ownerDb.content.findUniqueOrThrow({ where: { id: fx.contentId } });
    expect(c.status).toBe("AGUARDANDO_APROVACAO");
    expect(c.currentVersionId).toBe(edit.versionId);
    const old = await ownerDb.approval.findUniqueOrThrow({ where: { id: ap.approvalId } });
    expect(old.invalidatedAt).not.toBeNull();
    expect(old.invalidationReason).toBe("NOVA_VERSAO");
    const versions = await ownerDb.contentVersion.findMany({ where: { contentId: fx.contentId }, orderBy: { number: "asc" } });
    expect(versions.map((v) => [v.number, v.status])).toEqual([[1, "ENVIADA"], [2, "ENVIADA"]]);
    // decisao sobre a versao antiga: 409 versao desatualizada
    await expect(decideApproval(appDb, approver, { contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO" })).rejects.toMatchObject({ code: "STALE_VERSION" });
    // e a nova versao pode ser aprovada
    await decideApproval(appDb, owner, { contentId: fx.contentId, versionId: edit.versionId, decision: "APROVADO" });
  });

  it("editar so planejamento (data, pilar, notas) NAO cria versao nem invalida; material de publicado e recusado", async () => {
    const fx = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
    await decideApproval(appDb, owner, { contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO" });
    const { updatePlanning } = await import("@/server/services/contents");
    await updatePlanning(appDb, admin, fx.contentId, { pillar: "novo pilar", internalNotes: "nota nova" });
    expect(await ownerDb.contentVersion.count({ where: { contentId: fx.contentId } })).toBe(1);
    expect((await ownerDb.approval.findFirstOrThrow({ where: { versionId: fx.versionId } })).invalidatedAt).toBeNull();
    await sys((tx) => tx.content.update({ where: { id: fx.contentId }, data: { status: "PUBLICADO", publishedAt: new Date(), publicationUrl: "https://www.instagram.com/p/x/" } }));
    await expect(editMaterial(appDb, admin, fx.contentId, { caption: "tarde demais" })).rejects.toMatchObject({ code: "MATERIAL_LOCKED" });
  });

  it("silencio nao aprova: sem decisao, o status nao muda por mais que o tempo passe (nao existe caminho automatico)", async () => {
    const fx = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
    // Nao existe tarefa nem caminho automatico que decida por silencio: sem decisao, a leitura continua igual.
    // (O relogio simulado de 30 dias so tem o que provar quando existir o aviso de atraso, fase 4.)
    const detail = await getContentDetail(appDb, owner, fx.contentId);
    expect(detail.content.status).toBe("AGUARDANDO_APROVACAO");
    expect(detail.approvals).toEqual([]);
  });

  it("aprovacao concorrente: duas pessoas ao mesmo tempo geram UMA decisao e UM 409 (20 repeticoes)", async () => {
    for (let i = 0; i < 20; i++) {
      const fx = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
      const results = await Promise.allSettled([
        decideApproval(appDb, owner, { contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO" }),
        decideApproval(appDb, approver, { contentId: fx.contentId, versionId: fx.versionId, decision: i % 2 ? "APROVADO" : "REVISAO_SOLICITADA", comment: "discordo" }),
      ]);
      const ok = results.filter((r) => r.status === "fulfilled");
      const bad = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
      expect(ok, `rodada ${i}`).toHaveLength(1);
      expect(bad, `rodada ${i}`).toHaveLength(1);
      expect(bad[0].reason).toBeInstanceOf(ConflictError);
      expect(await ownerDb.approval.count({ where: { versionId: fx.versionId, invalidatedAt: null } })).toBe(1);
    }
  });

  it("o banco recusa aprovar versao que nao e a atual, versao de conteudo que nao aguarda e decisao duplicada (sem passar pelo servico)", async () => {
    const fx = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
    await editMaterial(appDb, admin, fx.contentId, { caption: "v2" }); // v2 ENVIADA, v1 deixa de ser atual
    await expect(
      withTenant(appDb, owner, ({ tx }) => tx.approval.create({ data: { clientId: w.clientA, contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO", authorId: w.ownerA.id } })),
    ).rejects.toThrow(/so a versao atual/i);
    const planejado = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id, "EM_PRODUCAO");
    await expect(
      withTenant(appDb, owner, ({ tx }) => tx.approval.create({ data: { clientId: w.clientA, contentId: planejado.contentId, versionId: planejado.versionId, decision: "APROVADO", authorId: w.ownerA.id } })),
    ).rejects.toThrow(/nao esta aguardando|row-level security/i);
    const fx2 = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
    await withTenant(appDb, owner, ({ tx }) => tx.approval.create({ data: { clientId: w.clientA, contentId: fx2.contentId, versionId: fx2.versionId, decision: "APROVADO", authorId: w.ownerA.id } }));
    await expect(
      sys((tx) => tx.approval.create({ data: { clientId: w.clientA, contentId: fx2.contentId, versionId: fx2.versionId, decision: "APROVADO", authorId: w.ownerA.id } })),
    ).rejects.toThrow(/approvals_one_active_decision_per_version|Unique constraint|so a versao atual|nao esta aguardando/i);
  });

  it("indice unico parcial: sem o gatilho, duas decisoes ativas na mesma versao ainda falham", async () => {
    const fx = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
    await sys((tx) => tx.approval.create({ data: { clientId: w.clientA, contentId: fx.contentId, versionId: fx.versionId, decision: "APROVADO", authorId: w.ownerA.id } }));
    await expect(
      sys(async (tx) => {
        await tx.$executeRawUnsafe("ALTER TABLE approvals DISABLE TRIGGER approvals_guard");
        await tx.approval.create({ data: { clientId: w.clientA, contentId: fx.contentId, versionId: fx.versionId, decision: "REVISAO_SOLICITADA", comment: "x", authorId: w.ownerA.id } });
        throw new Error("NAO-RECUSOU"); // desfaz o gatilho desligado se o indice nao recusar
      }),
    ).rejects.toThrow(/approvals_one_active_decision_per_version|Unique constraint/i);
  });

  it("aprovacao e imutavel: sem UPDATE (exceto invalidar uma vez), sem DELETE, sem TRUNCATE, nem para o dono do banco", async () => {
    const ap = await ownerDb.approval.findFirstOrThrow({ where: { clientId: w.clientA } });
    for (const db of [appDb, ownerDb]) {
      await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE approvals SET decision = 'REVISAO_SOLICITADA' WHERE id = '${ap.id}'`)), "update decisao").rejects.toThrow(/imutavel|permission denied/i);
      await expect(db.$executeRawUnsafe(`DELETE FROM approvals WHERE id = '${ap.id}'`), "delete").rejects.toThrow(/imutavel|permission denied/i);
    }
    await expect(ownerDb.$executeRawUnsafe("TRUNCATE approvals CASCADE")).rejects.toThrow(/imutavel/i);
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE approvals SET author_id = '${w.admin.id}' WHERE id = '${ap.id}'`))).rejects.toThrow(/imutavel/i);
    const tg = await ownerDb.$queryRaw<{ tgname: string; tgenabled: string }[]>`SELECT tgname::text AS tgname, tgenabled::text AS tgenabled FROM pg_trigger WHERE tgrelid IN ('approvals'::regclass, 'comments'::regclass, 'content_versions'::regclass) AND tgname IN ('approvals_guard','approvals_no_truncate','comments_guard','comments_no_truncate','content_versions_guard') ORDER BY tgname`;
    expect(tg.map((t) => t.tgenabled)).toEqual(["A", "A", "A", "A", "A"]);
  });

  it("versao ENVIADA e imutavel (UPDATE e DELETE recusados) e o historico de versoes nunca e apagado", async () => {
    const v = await ownerDb.contentVersion.findFirstOrThrow({ where: { clientId: w.clientA, status: "ENVIADA" } });
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE content_versions SET caption = 'adulterada' WHERE id = '${v.id}'`))).rejects.toThrow(/ENVIADA e imutavel/i);
    await expect(sys((tx) => tx.$executeRawUnsafe(`DELETE FROM content_versions WHERE id = '${v.id}'`))).rejects.toThrow(/nao e apagado/i);
    await expect(withTenant(appDb, admin, ({ tx }) => tx.$executeRawUnsafe(`UPDATE content_versions SET caption = 'x' WHERE id = '${v.id}'`))).rejects.toThrow(/ENVIADA e imutavel/i);
    expect((await ownerDb.contentVersion.findUniqueOrThrow({ where: { id: v.id } })).caption).toBe(v.caption);
  });

  it("so existe uma versao atual: o ponteiro so avanca, para versao ENVIADA do proprio conteudo", async () => {
    const fx = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
    const e = await editMaterial(appDb, admin, fx.contentId, { caption: "v2" });
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE contents SET current_version_id = '${fx.versionId}' WHERE id = '${fx.contentId}'`))).rejects.toThrow(/so avanca/i);
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE contents SET current_version_id = NULL WHERE id = '${fx.contentId}'`))).rejects.toThrow(/vazia/i);
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: fx.contentId } })).currentVersionId).toBe(e.versionId);
    const draftOnly = await sys((tx) => tx.contentVersion.create({ data: { clientId: w.clientA, contentId: fx.contentId, number: 3, authorId: w.admin.id } }));
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE contents SET current_version_id = '${draftOnly.id}' WHERE id = '${fx.contentId}'`))).rejects.toThrow(/ENVIADA/i);
    await expect(sys((tx) => tx.contentVersion.create({ data: { clientId: w.clientA, contentId: fx.contentId, number: 9, status: "ENVIADA", sentAt: new Date(), authorId: w.admin.id } }))).rejects.toThrow(/sequencial/i);
  });

  it("comentario e imutavel: sem UPDATE nem DELETE", async () => {
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE comments SET body = 'editado' WHERE id = '${a.commentPublic}'`))).rejects.toThrow(/imutavel/i);
    await expect(sys((tx) => tx.$executeRawUnsafe(`DELETE FROM comments WHERE id = '${a.commentPublic}'`))).rejects.toThrow(/imutavel/i);
    await expect(withTenant(appDb, admin, ({ tx }) => tx.$executeRawUnsafe(`DELETE FROM comments WHERE id = '${a.commentInternal}'`))).rejects.toThrow(/permission denied/i);
  });

  it("CANCELADO e terminal no banco", async () => {
    const fx = await makeAwaitingContent(w.clientA, a.cycleId, w.admin.id);
    await sys((tx) => tx.content.update({ where: { id: fx.contentId }, data: { status: "CANCELADO", cancelReason: "cancelado por teste ficticio", cancelledAt: new Date() } }));
    await expect(sys((tx) => tx.content.update({ where: { id: fx.contentId }, data: { status: "PLANEJADO" } }))).rejects.toThrow(/terminal/i);
    await expect(sys((tx) => tx.content.create({ data: { clientId: w.clientA, cycleId: a.cycleId, title: "sem justificativa", format: "ARTE", plannedOn: new Date("2026-11-11T00:00:00Z"), status: "CANCELADO" } }))).rejects.toThrow(/contents_values_check|check constraint/i);
  });
});
