import { beforeAll, describe, expect, it } from "vitest";
import { err, expectNoLeak, http } from "./helpers/http";
import { ownerDb, makePhase2World, type Phase2World } from "./helpers/phase2";

// IDOR/BOLA por HTTP real em TODAS as rotas novas da fase 2 (R-1, R-2, R-13, R-15): ids do Cliente B usados por
// quem e do Cliente A, em leitura, edicao, listagem, download e anexos. O banco do B nao pode mudar um byte.

let x: Phase2World;
type Route = { method: string; path: string; body?: unknown; label: string };

/** Todas as rotas /api/admin da fase 2 apontadas para o cliente `c`, usando os ids `ids` (do cliente dono dos ids). */
function adminRoutes(c: string, ids: Phase2World["a"], planId: string): Route[] {
  const base = `/api/admin/clients/${c}`;
  const r = (method: string, path: string, body?: unknown): Route => ({ method, path: base + path, body, label: `${method} ${path}` });
  return [
    r("GET", "/subscriptions"),
    r("POST", "/subscriptions", { planId, startsOn: "2027-01-01", billingDay: 5 }),
    r("PATCH", `/subscriptions/${ids.subscriptionId}`, { billingDay: 7 }),
    r("GET", "/cycles"),
    r("POST", "/cycles", { subscriptionId: ids.subscriptionId, year: 2026, month: 12 }),
    r("GET", `/cycles/${ids.cycleId}`),
    r("POST", `/cycles/${ids.cycleId}/close`),
    r("POST", `/cycles/${ids.cycleId}/reopen`, { reason: "motivo suficiente aqui" }),
    r("PUT", `/cycles/${ids.cycleId}/quota`, { quota: 99, reason: "motivo suficiente aqui" }),
    r("GET", "/contents"),
    r("POST", "/contents", { cycleId: ids.cycleId, title: "Invasao", format: "ARTE", plannedOn: "2026-11-10" }),
    r("GET", `/contents/${ids.contentShared}`),
    r("PATCH", `/contents/${ids.contentShared}`, { title: "Invadido" }),
    r("PUT", `/contents/${ids.contentShared}/material`, { caption: "invadido" }),
    r("POST", `/contents/${ids.contentShared}/send`, {}),
    r("POST", `/contents/${ids.contentShared}/status`, { to: "CANCELADO", cancelReason: "cancelamento indevido" }),
    r("PUT", `/contents/${ids.contentShared}/schedule`, { plannedOn: "2026-11-25" }),
    r("PUT", `/contents/${ids.contentShared}/classification`, { isBonus: true }),
    r("PUT", `/contents/${ids.contentShared}/visibility`, { visibility: "INTERNO" }),
    r("PUT", `/contents/${ids.contentShared}/cycle`, { cycleId: ids.cycleId, reason: "motivo suficiente aqui" }),
    r("GET", `/contents/${ids.contentShared}/comments`),
    r("POST", `/contents/${ids.contentShared}/comments`, { body: "comentario invasor" }),
    r("GET", "/calendar?year=2026&month=11"),
    r("GET", "/scripts"),
    r("POST", "/scripts", { title: "Invasor" }),
    r("GET", `/scripts/${ids.scriptSent}`),
    r("PATCH", `/scripts/${ids.scriptDraft}`, { title: "Invadido" }),
    r("POST", `/scripts/${ids.scriptSent}/status`, { to: "ENVIADO" }),
    r("POST", `/scripts/${ids.scriptSent}/comments`, { body: "comentario invasor" }),
    r("POST", `/scripts/${ids.scriptSent}/recordings`, { url: "https://drive.google.com/file/d/invasor" }),
    r("POST", `/recordings/${ids.recording}/confirm`),
    r("POST", `/recordings/${ids.recording}/rerecording`, { justification: "justificativa suficiente" }),
    r("GET", "/assets"),
    r("POST", "/assets", { originalName: "invasor.png", mimeType: "image/png", bytes: 100 }),
    r("GET", `/assets/${ids.assetAvailable}`),
    r("PATCH", `/assets/${ids.assetAvailable}`, { visibility: "INTERNO" }),
    r("DELETE", `/assets/${ids.assetAvailable}`),
    r("POST", `/assets/${ids.assetAvailable}/download`),
    r("POST", `/assets/${ids.assetAvailable}/links`, { role: "PREVIA", versionId: ids.versionDraft }),
    r("DELETE", `/asset-links/${ids.link}`),
    r("PUT", `/asset-links/${ids.link}`, { position: 3 }),
  ];
}

/** Rotas /api/portal usando ids do OUTRO cliente. */
function portalRoutes(o: Phase2World["a"], other: Phase2World["a"]): Route[] {
  const r = (method: string, path: string, body?: unknown): Route => ({ method, path: `/api/portal${path}`, body, label: `${method} ${path}` });
  return [
    r("GET", `/contents/${o.contentShared}`),
    r("GET", `/contents/${o.contentInternal}`),
    r("GET", `/contents/${o.contentShared}/comments`),
    r("POST", `/contents/${o.contentShared}/comments`, { body: "comentario invasor" }),
    r("POST", `/contents/${o.contentShared}/versions/${o.versionSent}/decision`, { decision: "APROVADO" }),
    // mistura: conteudo do B com versao do A, e o inverso
    r("POST", `/contents/${o.contentShared}/versions/${other.versionSent}/decision`, { decision: "APROVADO" }),
    r("POST", `/contents/${other.contentShared}/versions/${o.versionSent}/decision`, { decision: "APROVADO" }),
    r("GET", `/scripts/${o.scriptSent}`),
    r("GET", `/scripts/${o.scriptDraft}`),
    r("POST", `/scripts/${o.scriptSent}/comments`, { body: "comentario invasor" }),
    r("POST", `/scripts/${o.scriptSent}/recordings`, { url: "https://drive.google.com/file/d/invasor" }),
    r("GET", `/assets/${o.assetAvailable}`),
    r("DELETE", `/assets/${o.assetAvailable}`),
    r("POST", `/assets/${o.assetAvailable}/download`),
  ];
}

async function snapshotOf(clientId: string) {
  const [contents, versions, approvals, comments, scripts, recordings, assets, links, cycles, subs, audit] = await Promise.all([
    ownerDb.content.findMany({ where: { clientId }, orderBy: { id: "asc" }, select: { id: true, status: true, title: true, visibility: true, plannedOn: true, isBonus: true, currentVersionId: true } }),
    ownerDb.contentVersion.findMany({ where: { clientId }, orderBy: { id: "asc" }, select: { id: true, status: true, caption: true } }),
    ownerDb.approval.findMany({ where: { clientId }, orderBy: { id: "asc" }, select: { id: true, decision: true, invalidatedAt: true } }),
    ownerDb.comment.count({ where: { clientId } }),
    ownerDb.script.findMany({ where: { clientId }, orderBy: { id: "asc" }, select: { id: true, status: true, title: true } }),
    ownerDb.recording.findMany({ where: { clientId }, orderBy: { id: "asc" }, select: { id: true, status: true } }),
    ownerDb.asset.findMany({ where: { clientId }, orderBy: { id: "asc" }, select: { id: true, status: true, visibility: true } }),
    ownerDb.assetLink.count({ where: { clientId } }),
    ownerDb.editorialCycle.findMany({ where: { clientId }, orderBy: { id: "asc" }, select: { id: true, status: true, quota: true } }),
    ownerDb.subscription.findMany({ where: { clientId }, orderBy: { id: "asc" }, select: { id: true, status: true, billingDay: true } }),
    ownerDb.auditLog.count({ where: { clientId, action: { not: "seed.b" } } }),
  ]);
  return JSON.stringify({ contents, versions, approvals, comments, scripts, recordings, assets, links, cycles, subs, audit }, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
}

beforeAll(async () => {
  x = await makePhase2World();
});

describe("sem sessao: todas as rotas novas respondem 401", () => {
  it("admin, portal e arquivos", async () => {
    const all = [...adminRoutes(x.w.clientA, x.a, x.a.planId), ...portalRoutes(x.a, x.b)];
    for (const r of all) {
      const res = await http(r.path, { method: r.method, body: r.body });
      expect(res.status, r.label).toBe(401);
      expectNoLeak(res);
    }
    for (const [m, p] of [["PUT", "/api/files/upload/x.y"], ["GET", "/api/files/download/x.y"], ["GET", "/api/admin/plans"], ["POST", "/api/admin/plans"]] as const) {
      expect((await http(p, { method: m })).status, p).toBe(401);
    }
  });
});

describe("pessoa do Cliente A com ids do Cliente B", () => {
  it("rotas /api/portal: 404 em leitura, edicao, comentario, decisao, roteiro, gravacao, arquivo e download", async () => {
    const before = await snapshotOf(x.w.clientB);
    for (const who of ["ownerA", "collabApprover"] as const) {
      for (const r of portalRoutes(x.b, x.a)) {
        const res = await http(r.path, { method: r.method, cookie: x.cookie[who], body: r.body });
        expect(res.status, `${who} ${r.label}`).toBe(404);
        expect(err(res)?.code).toBe("NOT_FOUND");
        expectNoLeak(res);
        for (const secret of [x.b.marks.sharedCaption, x.b.marks.internalNote, x.b.marks.commentPublic, x.w.clientB, x.w.ownerB.email, x.b.assetAvailable]) {
          expect(res.text, `${who} ${r.label}`).not.toContain(secret);
        }
      }
    }
    expect(await snapshotOf(x.w.clientB)).toBe(before);
  });

  it("listagens do portal so trazem o proprio cliente, mesmo com ?clientId= e filtros do B", async () => {
    const urls = [
      "/api/portal/contents",
      "/api/portal/approvals",
      "/api/portal/scripts",
      "/api/portal/assets",
      "/api/portal/calendar?year=2026&month=11",
      "/api/portal/plan",
    ];
    for (const u of urls) {
      for (const q of ["", `${u.includes("?") ? "&" : "?"}clientId=${x.w.clientB}`, `${u.includes("?") ? "&" : "?"}cycleId=${x.b.cycleId}`]) {
        const res = await http(u + q, { cookie: x.cookie.ownerA });
        // cycleId de outro cliente em filtro nao existe para este cliente: vazio ou 200 sem dado do B (nunca erro de banco)
        // /plan com cycleId de OUTRO cliente: 404 (nunca os numeros dele); nas demais, o filtro nao acha nada e a lista vem vazia
        const foreignPlan = u === "/api/portal/plan" && q.includes(`cycleId=${x.b.cycleId}`);
        expect(res.status, `${u}${q}`).toBe(foreignPlan ? 404 : 200);
        for (const secret of [x.w.clientB, x.b.contentShared, x.b.scriptSent, x.b.assetAvailable, x.b.marks.sharedCaption, x.b.marks.commentPublic, x.w.ownerB.email, "Cliente B"]) {
          expect(res.text, `${u}${q}`).not.toContain(secret);
        }
      }
    }
    // o filtro do B devolve lista vazia, nao os itens do B
    const filtered = await http(`/api/portal/contents?cycleId=${x.b.cycleId}`, { cookie: x.cookie.ownerA });
    expect((filtered.json as { items: unknown[]; total: number }).total).toBe(0);
  });

  it("id de rota malformado e inexistente respondem o mesmo 404 (sem 500 de UUID invalido)", async () => {
    for (const bad of ["nao-e-uuid", "00000000-0000-4000-8000-000000000000", "1", "%00", "..%2f..%2fetc", "'; drop table contents;--"]) {
      for (const p of [`/api/portal/contents/${bad}`, `/api/portal/scripts/${bad}`, `/api/portal/assets/${bad}`, `/api/portal/contents/${bad}/versions/${bad}/decision`]) {
        const res = await http(p, { method: p.endsWith("decision") ? "POST" : "GET", cookie: x.cookie.ownerA, body: p.endsWith("decision") ? { decision: "APROVADO" } : undefined });
        expect(res.status, p).toBe(404);
        expectNoLeak(res);
      }
    }
  });

  it("rotas /api/admin: 403 com o id do A e com o id do B, e nada muda em nenhum dos dois", async () => {
    const beforeA = await snapshotOf(x.w.clientA);
    const beforeB = await snapshotOf(x.w.clientB);
    for (const who of ["ownerA", "collabA", "collabApprover"] as const) {
      for (const [client, ids] of [[x.w.clientA, x.a], [x.w.clientB, x.b]] as const) {
        for (const r of adminRoutes(client, ids, x.a.planId)) {
          const res = await http(r.path, { method: r.method, cookie: x.cookie[who], body: r.body });
          expect(res.status, `${who} ${r.path}`).toBe(403);
          expect(err(res)?.code).toBe("FORBIDDEN");
          expectNoLeak(res);
        }
      }
    }
    for (const who of ["ownerA", "collabA"] as const) {
      for (const [m, p, body] of [["GET", "/api/admin/plans"], ["POST", "/api/admin/plans", { code: "invasor", name: "Invasor", monthlyAmountCents: 1, monthlyQuota: 1, revisionsPerPiece: 1, approvalDeadlineBusinessDays: 1, scope: "x" }], ["POST", `/api/admin/plans/${x.a.planId}/versions`, {}], ["POST", `/api/admin/plans/${x.a.planId}/deactivate`]] as const) {
        const res = await http(p, { method: m, cookie: x.cookie[who], body });
        expect(res.status, `${who} ${p}`).toBe(403);
      }
    }
    expect(await snapshotOf(x.w.clientA)).toBe(beforeA);
    expect(await snapshotOf(x.w.clientB)).toBe(beforeB);
  });

  it("corpo com clientId ou campo de autoria/status e recusado (422), nunca aceito como verdade", async () => {
    for (const extra of [{ clientId: x.w.clientB }, { authorId: x.w.admin.id }, { status: "APROVADO" }, { createdAt: "2020-01-01T00:00:00Z" }]) {
      const dec = await http(`/api/portal/contents/${x.a.contentShared}/versions/${x.a.versionSent}/decision`, { method: "POST", cookie: x.cookie.ownerA, body: { decision: "REVISAO_SOLICITADA", comment: "ajustar", ...extra } });
      expect(dec.status, JSON.stringify(extra)).toBe(422);
      const com = await http(`/api/portal/contents/${x.a.contentShared}/comments`, { method: "POST", cookie: x.cookie.ownerA, body: { body: "oi", ...extra } });
      expect(com.status, JSON.stringify(extra)).toBe(422);
    }
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: x.a.contentShared } })).status).toBe("AGUARDANDO_APROVACAO");
  });
});

describe("equipe: STAFF so ve cliente atribuido", () => {
  it("STAFF atribuido ao A recebe 404 em todas as rotas /api/admin do B; nada muda", async () => {
    const before = await snapshotOf(x.w.clientB);
    for (const r of adminRoutes(x.w.clientB, x.b, x.a.planId)) {
      const res = await http(r.path, { method: r.method, cookie: x.cookie.staffA, body: r.body });
      expect(res.status, r.label).toBe(404);
      expectNoLeak(res);
      expect(res.text).not.toContain(x.b.marks.internalNote);
    }
    expect(await snapshotOf(x.w.clientB)).toBe(before);
  });

  it("STAFF nao atribuido a ninguem recebe 404 no A e no B (conteudo, versao, roteiro, arquivo, calendario, download)", async () => {
    const beforeA = await snapshotOf(x.w.clientA);
    for (const [client, ids] of [[x.w.clientA, x.a], [x.w.clientB, x.b]] as const) {
      for (const r of adminRoutes(client, ids, x.a.planId)) {
        const res = await http(r.path, { method: r.method, cookie: x.cookie.staffFree, body: r.body });
        expect(res.status, r.label).toBe(404);
        expect(res.text).not.toContain(ids.marks.internalNote);
        expect(res.text).not.toContain(ids.marks.objective);
      }
    }
    expect(await snapshotOf(x.w.clientA)).toBe(beforeA);
  });

  it("STAFF atribuido le o proprio cliente (nao e bloqueado por engano) e le o catalogo de planos, mas nao escreve plano", async () => {
    expect((await http(`/api/admin/clients/${x.w.clientA}/contents`, { cookie: x.cookie.staffA })).status).toBe(200);
    expect((await http("/api/admin/plans", { cookie: x.cookie.staffA })).status).toBe(200);
    const mk = await http("/api/admin/plans", { method: "POST", cookie: x.cookie.staffA, body: { code: "staff-plano", name: "Plano do staff", monthlyAmountCents: 1, monthlyQuota: 1, revisionsPerPiece: 1, approvalDeadlineBusinessDays: 1, scope: "x" } });
    expect(mk.status).toBe(403);
    expect((await http("/api/admin/plans", { cookie: x.cookie.ownerA })).status).toBe(403);
  });

  it("ADMIN e STAFF nao usam as rotas do portal (cada porta tem a sua autorizacao)", async () => {
    for (const who of ["admin", "staffA"] as const) {
      for (const p of ["/api/portal/contents", "/api/portal/plan", "/api/portal/approvals", "/api/portal/assets", "/api/portal/scripts", `/api/portal/contents/${x.a.contentShared}`]) {
        const res = await http(p, { cookie: x.cookie[who] });
        expect(res.status, `${who} ${p}`).toBe(403);
      }
      const dec = await http(`/api/portal/contents/${x.a.contentShared}/versions/${x.a.versionSent}/decision`, { method: "POST", cookie: x.cookie[who], body: { decision: "APROVADO" } });
      expect(dec.status).toBe(403);
    }
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: x.a.contentShared } })).status).toBe("AGUARDANDO_APROVACAO");
  });
});

describe("arquivos: bytes por link nao abrem arquivo de outro cliente", () => {
  it("link de upload e download exigem sessao e sao 404 para qualquer outra pessoa", async () => {
    const dl = await http(`/api/portal/assets/${x.a.assetAvailable}/download`, { method: "POST", cookie: x.cookie.ownerA });
    // o arquivo do fixture so existe no banco (sem objeto no disco): o link e emitido, e a entrega e 404 honesto
    expect(dl.status).toBe(200);
    const link = (dl.json as { path: string }).path;
    for (const who of ["ownerB", "collabA", "staffFree"] as const) {
      const r = await http(link, { cookie: x.cookie[who] });
      expect(r.status, who).toBe(404);
      expectNoLeak(r);
    }
    expect((await http(link, { cookie: x.cookie.ownerA })).status).toBe(404); // objeto ausente no disco
    expect((await http(link)).status).toBe(401);
  });
});
