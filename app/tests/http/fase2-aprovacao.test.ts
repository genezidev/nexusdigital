import { beforeAll, describe, expect, it } from "vitest";
import { makeAwaitingContent } from "../integration/helpers/phase2";
import { err, expectNoLeak, http } from "./helpers/http";
import { api, ownerDb, makePhase2World, type Phase2World } from "./helpers/phase2";

// Aprovacao e visibilidade por HTTP real (R-12, R-13): quem aprova, aprovacao por versao, invalidacao por edicao,
// concorrencia e a varredura de marcas internas em TODAS as respostas do portal.

let x: Phase2World;
const decide = (cookie: string, contentId: string, versionId: string, body: unknown) =>
  http(`/api/portal/contents/${contentId}/versions/${versionId}/decision`, { method: "POST", cookie, body });
const fresh = async () => makeAwaitingContent(x.w.clientA, x.a.cycleId, x.w.admin.id);

beforeAll(async () => {
  x = await makePhase2World();
});

describe("quem pode aprovar (R-2, R-12)", () => {
  it("CLIENT_OWNER aprova: versao, autor e horario gravados pelo servidor; conteudo vira APROVADO", async () => {
    const c = await fresh();
    const res = await decide(x.cookie.ownerA, c.contentId, c.versionId, { decision: "APROVADO", comment: "tudo certo" });
    expect(res.status).toBe(201);
    const row = await ownerDb.approval.findFirstOrThrow({ where: { contentId: c.contentId } });
    expect(row).toMatchObject({ versionId: c.versionId, authorId: x.w.ownerA.id, decision: "APROVADO", invalidatedAt: null, clientId: x.w.clientA });
    expect(Math.abs(row.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: c.contentId } })).status).toBe("APROVADO");
  });

  it("autor e horario enviados no corpo sao recusados (422); nunca viram verdade", async () => {
    const c = await fresh();
    const res = await decide(x.cookie.ownerA, c.contentId, c.versionId, { decision: "APROVADO", authorId: x.w.admin.id, createdAt: "2001-01-01T00:00:00Z" });
    expect(res.status).toBe(422);
    expect(await ownerDb.approval.count({ where: { contentId: c.contentId } })).toBe(0);
  });

  it("ADMIN, STAFF atribuido e STAFF livre nao aprovam em nome do cliente; CLIENT_COLLABORATOR sem content:approve nao aprova", async () => {
    const c = await fresh();
    for (const who of ["admin", "staffA", "staffFree", "collabA"] as const) {
      const res = await decide(x.cookie[who], c.contentId, c.versionId, { decision: "APROVADO" });
      expect(res.status, who).toBe(403);
      expectNoLeak(res);
    }
    // "revisao" tambem e decisao: mesma regra
    expect((await decide(x.cookie.collabA, c.contentId, c.versionId, { decision: "REVISAO_SOLICITADA", comment: "ajuste" })).status).toBe(403);
    expect(await ownerDb.approval.count({ where: { contentId: c.contentId } })).toBe(0);
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: c.contentId } })).status).toBe("AGUARDANDO_APROVACAO");
  });

  it("CLIENT_COLLABORATOR com a concessao content:approve aprova; usuario do outro cliente recebe 404", async () => {
    const c = await fresh();
    expect((await decide(x.cookie.ownerB, c.contentId, c.versionId, { decision: "APROVADO" })).status).toBe(404);
    const ok = await decide(x.cookie.collabApprover, c.contentId, c.versionId, { decision: "APROVADO" });
    expect(ok.status).toBe(201);
    expect((await ownerDb.approval.findFirstOrThrow({ where: { contentId: c.contentId } })).authorId).toBe(x.collabApprover.id);
  });

  it("versao de OUTRO conteudo do mesmo cliente nao serve para decidir (404, nada gravado)", async () => {
    const a = await fresh();
    const b = await fresh();
    const res = await decide(x.cookie.ownerA, a.contentId, b.versionId, { decision: "APROVADO" });
    expect(res.status).toBe(404);
    expect(await ownerDb.approval.count({ where: { contentId: { in: [a.contentId, b.contentId] } } })).toBe(0);
  });

  it("conteudo INTERNO e conteudo fora de AGUARDANDO nao recebem decisao do cliente", async () => {
    expect((await decide(x.cookie.ownerA, x.a.contentInternal, x.a.versionDraft, { decision: "APROVADO" })).status).toBe(404);
    const notAwaiting = await makeAwaitingContent(x.w.clientA, x.a.cycleId, x.w.admin.id, "EM_PRODUCAO");
    const res = await decide(x.cookie.ownerA, notAwaiting.contentId, notAwaiting.versionId, { decision: "APROVADO" });
    expect(res.status).toBe(409);
    expect(await ownerDb.approval.count({ where: { contentId: notAwaiting.contentId } })).toBe(0);
  });
});

describe("aprovacao por versao", () => {
  it("segunda decisao sobre a mesma versao: 409 com quem e quando; a mesma pessoa repetindo recebe a mesma resposta (sem linha nova)", async () => {
    const c = await fresh();
    const first = await decide(x.cookie.ownerA, c.contentId, c.versionId, { decision: "APROVADO" });
    expect(first.status).toBe(201);
    const dup = await decide(x.cookie.ownerA, c.contentId, c.versionId, { decision: "APROVADO" });
    expect(dup.status).toBe(200);
    expect((dup.json as { approvalId: string; replayed: boolean }).approvalId).toBe((first.json as { approvalId: string }).approvalId);
    expect((dup.json as { replayed: boolean }).replayed).toBe(true);
    const other = await decide(x.cookie.collabApprover, c.contentId, c.versionId, { decision: "REVISAO_SOLICITADA", comment: "mudar" });
    expect(other.status).toBe(409);
    expect(err(other)?.code).toBe("ALREADY_DECIDED");
    expect(err(other)?.message).toContain("dono-a"); // nome de quem decidiu primeiro (pessoa ficticia do teste)
    const same = await decide(x.cookie.ownerA, c.contentId, c.versionId, { decision: "REVISAO_SOLICITADA", comment: "mudei de ideia" });
    expect(same.status).toBe(409);
    expect(await ownerDb.approval.count({ where: { contentId: c.contentId } })).toBe(1);
  });

  it("pedido de revisao exige comentario (422), muda para EM_REVISAO e nova versao devolve a fila", async () => {
    const c = await fresh();
    expect((await decide(x.cookie.ownerA, c.contentId, c.versionId, { decision: "REVISAO_SOLICITADA" })).status).toBe(422);
    expect((await decide(x.cookie.ownerA, c.contentId, c.versionId, { decision: "REVISAO_SOLICITADA", comment: "   " })).status).toBe(422);
    const ok = await decide(x.cookie.ownerA, c.contentId, c.versionId, { decision: "REVISAO_SOLICITADA", comment: "trocar a foto" });
    expect(ok.status).toBe(201);
    expect(JSON.stringify(ok.json)).not.toContain("overRevisionLimit"); // sinal interno da agencia
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: c.contentId } })).status).toBe("EM_REVISAO");
    // a agencia ajusta e envia: o conteudo volta a AGUARDANDO_APROVACAO com versao 2 atual
    const admin = api(x.cookie.admin);
    const base = `/api/admin/clients/${x.w.clientA}/contents/${c.contentId}`;
    expect((await admin.put(`${base}/material`, { caption: "legenda nova" })).status).toBe(200);
    const sent = await admin.post(`${base}/send`, {});
    expect(sent.status).toBe(200);
    const after = await ownerDb.content.findUniqueOrThrow({ where: { id: c.contentId }, include: { currentVersion: true } });
    expect(after.status).toBe("AGUARDANDO_APROVACAO");
    expect(after.currentVersion?.number).toBe(2);
    const queue = await http("/api/portal/approvals", { cookie: x.cookie.ownerA });
    expect(JSON.stringify(queue.json)).toContain(c.contentId);
  });

  it("decisao sobre versao antiga (nova versao enviada enquanto o cliente olhava a anterior): 409 STALE_VERSION", async () => {
    const c = await fresh();
    const admin = api(x.cookie.admin);
    const base = `/api/admin/clients/${x.w.clientA}/contents/${c.contentId}`;
    // a agencia edita o material enquanto aguarda: nasce a versao 2, ja enviada
    expect((await admin.put(`${base}/material`, { caption: "versao 2" })).status).toBe(200);
    const stale = await decide(x.cookie.ownerA, c.contentId, c.versionId, { decision: "APROVADO" });
    expect(stale.status).toBe(409);
    expect(await ownerDb.approval.count({ where: { contentId: c.contentId } })).toBe(0);
    const v2 = (await ownerDb.content.findUniqueOrThrow({ where: { id: c.contentId } })).currentVersionId!;
    expect((await decide(x.cookie.ownerA, c.contentId, v2, { decision: "APROVADO" })).status).toBe(201);
  });

  it("editar o material de um conteudo APROVADO cria versao nova, invalida a aprovacao (com motivo) e devolve a fila; planejamento nao invalida", async () => {
    const c = await fresh();
    await decide(x.cookie.ownerA, c.contentId, c.versionId, { decision: "APROVADO" });
    const admin = api(x.cookie.admin);
    const base = `/api/admin/clients/${x.w.clientA}/contents/${c.contentId}`;
    // so planejamento (data, responsavel): a aprovacao continua valida
    expect((await admin.put(`${base}/schedule`, { plannedOn: "2026-11-27" })).status).toBe(200);
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: c.contentId } })).status).toBe("APROVADO");
    // material: invalida
    const edit = await admin.put(`${base}/material`, { caption: "legenda alterada depois de aprovar" });
    expect(edit.status).toBe(200);
    const row = await ownerDb.approval.findFirstOrThrow({ where: { contentId: c.contentId } });
    expect(row.invalidatedAt).not.toBeNull();
    expect(row.invalidationReason).toBe("NOVA_VERSAO");
    const content = await ownerDb.content.findUniqueOrThrow({ where: { id: c.contentId }, include: { currentVersion: true } });
    expect(content.status).toBe("AGUARDANDO_APROVACAO");
    expect(content.currentVersion?.number).toBe(2);
    // o cliente ve a decisao antiga como invalidada, ligada a versao 1
    const detail = await http(`/api/portal/contents/${c.contentId}`, { cookie: x.cookie.ownerA });
    const approvals = (detail.json as { approvals: { versionId: string; invalidatedAt: string | null; invalidationReason: string | null }[] }).approvals;
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({ versionId: c.versionId, invalidationReason: "NOVA_VERSAO" });
    expect(approvals[0].invalidatedAt).not.toBeNull();
    // e pode aprovar a versao nova
    expect((await decide(x.cookie.ownerA, c.contentId, content.currentVersionId!, { decision: "APROVADO" })).status).toBe(201);
  });

  it("material desatualizado na edicao da agencia: 409 (expectedVersionId)", async () => {
    const c = await fresh();
    const admin = api(x.cookie.admin);
    const base = `/api/admin/clients/${x.w.clientA}/contents/${c.contentId}`;
    expect((await admin.put(`${base}/material`, { caption: "v2", expectedVersionId: c.versionId })).status).toBe(200);
    const stale = await admin.put(`${base}/material`, { caption: "v3 sobre base velha", expectedVersionId: c.versionId });
    expect(stale.status).toBe(409);
    expect(err(stale)?.code).toBe("STALE_VERSION");
  });

  it("aprovacao concorrente: 10 rodadas de duas pessoas ao mesmo tempo geram UMA decisao e um 409 em cada rodada", async () => {
    for (let i = 0; i < 10; i++) {
      const c = await fresh();
      const [r1, r2] = await Promise.all([
        decide(x.cookie.ownerA, c.contentId, c.versionId, { decision: "APROVADO" }),
        decide(x.cookie.collabApprover, c.contentId, c.versionId, i % 2 ? { decision: "APROVADO" } : { decision: "REVISAO_SOLICITADA", comment: "ajustar o texto" }),
      ]);
      expect([r1.status, r2.status].sort(), `rodada ${i}`).toEqual([201, 409]);
      expect(await ownerDb.approval.count({ where: { versionId: c.versionId, invalidatedAt: null } }), `rodada ${i}`).toBe(1);
    }
  }, 120_000);

  it("botao apertado varias vezes pela mesma pessoa em paralelo: uma linha, as duas respostas com o mesmo id", async () => {
    const c = await fresh();
    const rs = await Promise.all([0, 1, 2].map(() => decide(x.cookie.ownerA, c.contentId, c.versionId, { decision: "APROVADO" })));
    expect(rs.map((r) => r.status).every((s) => s === 200 || s === 201)).toBe(true);
    expect(new Set(rs.map((r) => (r.json as { approvalId: string }).approvalId)).size).toBe(1);
    expect(await ownerDb.approval.count({ where: { contentId: c.contentId } })).toBe(1);
  });

  it("silencio nao aprova: sem decisao o conteudo continua aguardando, mesmo depois de muito tempo (nao existe tarefa que aprove)", async () => {
    const c = await fresh();
    await http("/api/portal/approvals", { cookie: x.cookie.ownerA });
    await http(`/api/portal/contents/${c.contentId}`, { cookie: x.cookie.ownerA });
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: c.contentId } })).status).toBe("AGUARDANDO_APROVACAO");
    expect(await ownerDb.approval.count({ where: { contentId: c.contentId } })).toBe(0);
  });
});

describe("visibilidade: rascunho e nota interna nunca chegam ao portal (R-13)", () => {
  const INTERNAL = () => [x.a.marks.internalNote, x.a.marks.objective, x.a.marks.draft, x.a.marks.commentInternal, x.a.marks.briefing, `PILAR-${x.a.tag}`, x.a.contentInternal, x.a.versionDraft, x.a.scriptDraft, x.a.commentInternal];

  it("controle: a agencia ve as marcas (a varredura de baixo esta procurando coisa que existe)", async () => {
    const admin = api(x.cookie.admin);
    const detail = await admin.get(`/api/admin/clients/${x.w.clientA}/contents/${x.a.contentShared}`);
    for (const m of [x.a.marks.internalNote, x.a.marks.objective, x.a.marks.commentInternal, x.a.marks.briefing]) expect(detail.text).toContain(m);
    const draft = await admin.get(`/api/admin/clients/${x.w.clientA}/contents/${x.a.contentInternal}`);
    expect(draft.text).toContain(x.a.marks.draft);
    expect((await admin.get(`/api/admin/clients/${x.w.clientA}/scripts/${x.a.scriptDraft}`)).status).toBe(200);
  });

  it("varredura: nenhuma resposta do portal (dono e colaborador) contem marca interna, e a parte compartilhada aparece", async () => {
    const urls = [
      "/api/portal/contents",
      "/api/portal/contents?pageSize=50&sort=title&dir=desc",
      `/api/portal/contents/${x.a.contentShared}`,
      `/api/portal/contents/${x.a.contentShared}/comments`,
      "/api/portal/approvals",
      "/api/portal/calendar?year=2026&month=11",
      "/api/portal/plan",
      "/api/portal/scripts",
      `/api/portal/scripts/${x.a.scriptSent}`,
      "/api/portal/assets",
      `/api/portal/assets/${x.a.assetAvailable}`,
    ];
    for (const who of ["ownerA", "collabA", "collabApprover"] as const) {
      for (const u of urls) {
        const res = await http(u, { cookie: x.cookie[who] });
        expect(res.status, `${who} ${u}`).toBe(200);
        for (const m of INTERNAL()) expect(res.text, `${who} ${u} vazou ${m}`).not.toContain(m);
        expect(res.headers.get("cache-control")).toContain("no-store");
      }
    }
    const detail = await http(`/api/portal/contents/${x.a.contentShared}`, { cookie: x.cookie.ownerA });
    expect(detail.text).toContain(x.a.marks.sharedCaption);
    expect(detail.text).toContain(x.a.marks.commentPublic);
    // por id, o conteudo interno e o roteiro em rascunho nem existem para o cliente
    for (const p of [`/api/portal/contents/${x.a.contentInternal}`, `/api/portal/scripts/${x.a.scriptDraft}`, `/api/portal/contents/${x.a.contentInternal}/comments`]) {
      expect((await http(p, { cookie: x.cookie.ownerA })).status, p).toBe(404);
    }
  });

  it("o formato do cliente e a lista explicita: nem uma chave interna no JSON", async () => {
    const detail = (await http(`/api/portal/contents/${x.a.contentShared}`, { cookie: x.cookie.ownerA })).json as {
      content: Record<string, unknown>;
      versions: Record<string, unknown>[];
      comments: Record<string, unknown>[];
      approvals: Record<string, unknown>[];
    };
    expect(Object.keys(detail.content).sort()).toEqual(["assigneeName", "currentVersionId", "cycleId", "channel", "format", "id", "plannedOn", "publicationUrl", "publishedAt", "status", "title"].sort());
    expect(Object.keys(detail.versions[0]).sort()).toEqual(["caption", "contentId", "cta", "hashtags", "id", "number", "sentAt", "status"].sort());
    for (const c of detail.comments) expect(c.visibility).toBe("COMPARTILHADO");
    const plan = (await http("/api/portal/plan", { cookie: x.cookie.ownerA })).json as { subscription: Record<string, unknown>; progress: Record<string, unknown> };
    expect(Object.keys(plan.progress).sort()).toEqual(["approved", "hasQuota", "percent", "planned", "produced", "published", "quota", "surplus"]);
    expect(plan.subscription).not.toHaveProperty("billingDay");
    expect(plan.subscription).not.toHaveProperty("planId");
  });

  it("comentarios: o cliente so cria compartilhado (INTERNO = 403); o comentario interno da agencia continua escondido", async () => {
    const own = await http(`/api/portal/contents/${x.a.contentShared}/comments`, { method: "POST", cookie: x.cookie.ownerA, body: { body: "COMENT-DO-CLIENTE" } });
    expect(own.status).toBe(201);
    const internal = await http(`/api/portal/contents/${x.a.contentShared}/comments`, { method: "POST", cookie: x.cookie.ownerA, body: { body: "tentando interno", visibility: "INTERNO" } });
    expect(internal.status).toBe(403);
    const admin = api(x.cookie.admin);
    const base = `/api/admin/clients/${x.w.clientA}/contents/${x.a.contentShared}/comments`;
    expect((await admin.post(base, { body: "COMENT-INTERNO-NOVO" })).status).toBe(201); // padrao da agencia: interno
    expect((await admin.post(base, { body: "COMENT-COMPARTILHADO-NOVO", visibility: "COMPARTILHADO" })).status).toBe(201);
    const portal = await http(`/api/portal/contents/${x.a.contentShared}/comments`, { cookie: x.cookie.collabA });
    expect(portal.text).toContain("COMENT-DO-CLIENTE");
    expect(portal.text).toContain("COMENT-COMPARTILHADO-NOVO");
    expect(portal.text).not.toContain("COMENT-INTERNO-NOVO");
    expect(portal.text).not.toContain(x.a.marks.commentInternal);
    // limite de tamanho (2000) e corpo vazio
    expect((await http(`/api/portal/contents/${x.a.contentShared}/comments`, { method: "POST", cookie: x.cookie.ownerA, body: { body: "x".repeat(2001) } })).status).toBe(422);
    expect((await http(`/api/portal/contents/${x.a.contentShared}/comments`, { method: "POST", cookie: x.cookie.ownerA, body: { body: "  " } })).status).toBe(422);
  });

  it("o cliente nao edita nem apaga comentario e nao muda conteudo: rotas de escrita da agencia nao existem para ele", async () => {
    for (const m of ["PUT", "PATCH", "DELETE"]) {
      const res = await http(`/api/portal/contents/${x.a.contentShared}`, { method: m, cookie: x.cookie.ownerA, body: { title: "x" } });
      expect(res.status).toBe(405);
    }
  });
});
