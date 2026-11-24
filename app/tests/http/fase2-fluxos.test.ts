import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { addMember, makeClient, makeUser } from "../integration/helpers/world";
import { err, expectNoLeak, http, login } from "./helpers/http";
import { api, mp4, makePhase2World, ownerDb, uploadVia, type Phase2World } from "./helpers/phase2";

// Fluxos P1 a P5 por HTTP real: plano, assinatura, ciclo, conteudos, status, calendario, roteiros e gravacoes, com a
// matriz de permissoes (ADMIN, STAFF atribuido, cliente) e as regras de erro da spec (409, 422, 413...).

let x: Phase2World;
let clientC: string;
let ownerC: { cookie: string; id: string };
let planId: string;
let planCode: string;
let subId: string;
let cycleId: string;
const admin = () => api(x.cookie.admin);
const C = () => `/api/admin/clients/${clientC}`;

beforeAll(async () => {
  x = await makePhase2World();
  clientC = await makeClient("C");
  const u = await makeUser("USER", "dono-c");
  await addMember(clientC, u.id, "CLIENT_OWNER");
  ownerC = { id: u.id, cookie: await login(u.email) };
});

describe("P1: plano, assinatura, ciclo com cota e progresso", () => {
  it("so o ADMIN cria plano e versao nova; STAFF le o catalogo; codigo repetido da 409; entrada invalida da 422", async () => {
    planCode = `essencial-${randomUUID().slice(0, 6)}`;
    const body = { code: planCode, name: "Essencial (exemplo)", monthlyAmountCents: 150000, monthlyQuota: 12, revisionsPerPiece: 2, approvalDeadlineBusinessDays: 3, scope: "Escopo ficticio", exclusions: "Nada de trafego pago" };
    expect((await api(x.cookie.staffA).post("/api/admin/plans", body)).status).toBe(403);
    const created = await admin().post("/api/admin/plans", body);
    expect(created.status).toBe(201);
    planId = (created.json as { id: string }).id;
    expect((await admin().post("/api/admin/plans", body)).status).toBe(409);
    for (const bad of [{ ...body, code: "MAIUSCULO" }, { ...body, monthlyQuota: -1 }, { ...body, name: "" }, { ...body, extra: 1 }, { ...body, monthlyAmountCents: 1.5 }]) {
      expect((await admin().post("/api/admin/plans", bad)).status, JSON.stringify(bad).slice(0, 60)).toBe(422);
    }
    const list = await api(x.cookie.staffA).get("/api/admin/plans");
    expect(list.status).toBe(200);
    expect(list.text).toContain(planCode);
    // versao 2 com cota maior: a v1 fica inativa; `code` nao faz parte do corpo da versao (campo desconhecido = 422)
    const { code: _code, ...noCode } = body;
    void _code;
    expect((await admin().post(`/api/admin/plans/${planId}/versions`, { ...noCode, code: planCode })).status).toBe(422);
    const v2ok = await admin().post(`/api/admin/plans/${planId}/versions`, { ...noCode, monthlyQuota: 20, name: "Essencial v2" });
    expect(v2ok.status).toBe(201);
    expect((v2ok.json as { version: number }).version).toBe(2);
    expect((await ownerDb.servicePlan.findUniqueOrThrow({ where: { id: planId } })).active).toBe(false);
    // plano inativo nao gera assinatura nova
    expect((await admin().post(`${C()}/subscriptions`, { planId, startsOn: "2026-11-10", billingDay: 10 })).status).toBe(404);
    planId = (v2ok.json as { id: string }).id;
  });

  it("assinatura congela escopo e cota; segunda ativa e 409; STAFF nao cria", async () => {
    expect((await admin().post(`${C()}/subscriptions`, { planId, startsOn: "2026-13-10", billingDay: 10 })).status).toBe(422);
    expect((await admin().post(`${C()}/subscriptions`, { planId, startsOn: "2026-11-10", billingDay: 31 })).status).toBe(422);
    const s = await admin().post(`${C()}/subscriptions`, { planId, startsOn: "2026-11-10", billingDay: 10 });
    expect(s.status).toBe(201);
    subId = (s.json as { id: string }).id;
    expect(s.json).toMatchObject({ planName: "Essencial v2", quota: 20, status: "ATIVA", startsOn: "2026-11-10" });
    expect((await admin().post(`${C()}/subscriptions`, { planId, startsOn: "2027-01-01", billingDay: 10 })).status).toBe(409);
    expect((await api(x.cookie.staffA).post(`/api/admin/clients/${x.w.clientA}/subscriptions`, { planId, startsOn: "2027-01-01", billingDay: 10 })).status).toBe(403);
    expect((await admin().patch(`${C()}/subscriptions/${subId}`, {})).status).toBe(422);
    expect((await admin().patch(`${C()}/subscriptions/${subId}`, { billingDay: 12 })).status).toBe(200);
    const list = await admin().get(`${C()}/subscriptions?status=ATIVA`);
    expect((list.json as { total: number }).total).toBe(1);
  });

  it("ciclo: cota copiada da assinatura (20) mas ajustada para 12 com justificativa; duplicado 409; fora da vigencia 422", async () => {
    const noReason = await admin().post(`${C()}/cycles`, { subscriptionId: subId, year: 2026, month: 11, quota: 12 });
    expect(noReason.status).toBe(422);
    expect(err(noReason)?.code).toBe("REASON_REQUIRED");
    const c = await admin().post(`${C()}/cycles`, { subscriptionId: subId, year: 2026, month: 11, quota: 12, reason: "mes parcial, cota combinada com o cliente" });
    expect(c.status).toBe(201);
    cycleId = (c.json as { id: string }).id;
    expect(c.json).toMatchObject({ quota: 12, previousQuota: 20, status: "ABERTO" });
    expect((await admin().post(`${C()}/cycles`, { subscriptionId: subId, year: 2026, month: 11 })).status).toBe(409);
    const dup = await Promise.all([1, 2, 3].map(() => admin().post(`${C()}/cycles`, { subscriptionId: subId, year: 2027, month: 1 })));
    expect(dup.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect((await admin().post(`${C()}/cycles`, { subscriptionId: subId, year: 2026, month: 9 })).status).toBe(422); // antes da vigencia
    expect((await admin().post(`${C()}/cycles`, { subscriptionId: randomUUID(), year: 2026, month: 12 })).status).toBe(404);
    expect(await ownerDb.auditLog.count({ where: { clientId: clientC, action: "cycle.created" } })).toBeGreaterThanOrEqual(2);
  });

  it("12 pecas planejadas: o cliente ve o plano e '0 de 12' (so numeros); a cota do ciclo nao muda se o plano mudar", async () => {
    for (let i = 1; i <= 12; i++) {
      const r = await admin().post(`${C()}/contents`, { cycleId, title: `Peca ${i}`, format: i <= 3 ? "ARTE" : i <= 7 ? "CARROSSEL" : "REEL_ANIMADO", plannedOn: `2026-11-${String(10 + i).padStart(2, "0")}` });
      expect(r.status, `peca ${i}`).toBe(201);
    }
    const story = await admin().post(`${C()}/contents`, { cycleId, title: "Story fora da cota", format: "STORY", plannedOn: "2026-11-15" });
    expect(story.json).toMatchObject({ countsTowardQuota: false });
    const plan = await http(`/api/portal/plan?cycleId=${cycleId}`, { cookie: ownerC.cookie });
    expect(plan.status).toBe(200);
    const body = plan.json as { subscription: { planName: string; quota: number }; progress: Record<string, number | boolean | null>; cycle: { quota: number } };
    expect(body.subscription).toMatchObject({ planName: "Essencial v2" });
    expect(body.progress).toMatchObject({ quota: 12, planned: 12, produced: 0, approved: 0, published: 0, percent: 0, surplus: 0, hasQuota: true });
    expect(plan.text).not.toContain("Peca 1"); // numeros, nunca titulos
    // plano novo depois: o ciclo continua com a cota gravada
    const { code, ...rest } = { code: planCode, name: "Essencial v3", monthlyAmountCents: 1, monthlyQuota: 30, revisionsPerPiece: 1, approvalDeadlineBusinessDays: 1, scope: "x", exclusions: "" };
    void code;
    expect((await admin().post(`/api/admin/plans/${planId}/versions`, rest)).status).toBe(201);
    const cyc = await admin().get(`${C()}/cycles/${cycleId}`);
    expect(cyc.json).toMatchObject({ cycle: { quota: 12 }, progress: { quota: 12, planned: 12, source: "live" } });
    // o dono do outro cliente nao ve nada disso
    const other = await http("/api/portal/plan", { cookie: x.cookie.ownerB });
    expect(other.text).not.toContain("Essencial v2");
    // ciclo de outro cliente por parametro: 404, nunca os numeros dele
    expect((await http(`/api/portal/plan?cycleId=${cycleId}`, { cookie: x.cookie.ownerB })).status).toBe(404);
    // sem parametro: o ciclo da competencia atual (2026-11 existe; 2027-01 ainda e futuro)
    const def = (await http("/api/portal/plan", { cookie: ownerC.cookie })).json as { cycle: { year: number; month: number } };
    expect(def.cycle.year * 12 + def.cycle.month).toBeLessThanOrEqual(2027 * 12 + 1);
  });

  it("ajuste de cota so do ADMIN, com justificativa; ciclo encerrado guarda o retrato e nao aceita ajuste; reabrir exige justificativa", async () => {
    expect((await api(x.cookie.staffA).put(`/api/admin/clients/${x.w.clientA}/cycles/${x.a.cycleId}/quota`, { quota: 3, reason: "motivo bastante longo" })).status).toBe(403);
    expect((await admin().put(`${C()}/cycles/${cycleId}/quota`, { quota: 14 })).status).toBe(422);
    expect((await admin().put(`${C()}/cycles/${cycleId}/quota`, { quota: 14, reason: "curto" })).status).toBe(422);
    expect((await admin().put(`${C()}/cycles/${cycleId}/quota`, { quota: 14, reason: "cliente pediu mais pecas no mes" })).status).toBe(200);
    expect(await ownerDb.auditLog.count({ where: { clientId: clientC, action: "cycle.quota_adjusted" } })).toBe(1);
    expect((await admin().post(`${C()}/cycles/${cycleId}/close`)).status).toBe(200);
    expect((await admin().post(`${C()}/cycles/${cycleId}/close`)).status).toBe(422);
    expect((await admin().put(`${C()}/cycles/${cycleId}/quota`, { quota: 5, reason: "tentando mudar historico" })).status).toBe(422);
    const closed = await admin().get(`${C()}/cycles/${cycleId}`);
    expect(closed.json).toMatchObject({ cycle: { status: "ENCERRADO" }, progress: { source: "snapshot", quota: 14, planned: 12 } });
    // peca nova em ciclo encerrado e recusada
    expect((await admin().post(`${C()}/contents`, { cycleId, title: "Tarde demais", format: "ARTE", plannedOn: "2026-11-28" })).status).toBe(422);
    expect((await admin().post(`${C()}/cycles/${cycleId}/reopen`, { reason: "curto" })).status).toBe(422);
    expect((await admin().post(`${C()}/cycles/${cycleId}/reopen`, { reason: "faltou registrar duas pecas" })).status).toBe(200);
    expect((await admin().get(`${C()}/cycles/${cycleId}`)).json).toMatchObject({ progress: { source: "live" } });
  });
});

describe("P2: conteudos, status, cancelamento, publicacao e calendario", () => {
  let id: string;
  const base = () => `/api/admin/clients/${x.w.clientA}/contents`;
  const staff = () => api(x.cookie.staffA);

  it("STAFF atribuido cria e opera conteudo; plano, ciclo e classificacao ficam so com o ADMIN", async () => {
    const created = await staff().post(base(), { cycleId: x.a.cycleId, title: "Peca do staff", format: "ARTE", plannedOn: "2026-11-12" });
    expect(created.status).toBe(201);
    id = (created.json as { id: string }).id;
    expect((await staff().put(`${base()}/${id}/classification`, { isBonus: true })).status).toBe(403);
    expect((await staff().post(`/api/admin/clients/${x.w.clientA}/cycles`, { subscriptionId: x.a.subscriptionId, year: 2027, month: 2 })).status).toBe(403);
    expect((await staff().put(`${base()}/${id}/cycle`, { cycleId: x.a.cycleId, reason: "motivo suficiente" })).status).toBe(403);
    expect((await admin().put(`${base()}/${id}/classification`, { isBonus: true })).status).toBe(200);
    expect(await ownerDb.auditLog.count({ where: { entityId: id, action: "content.classification_changed" } })).toBe(1);
    // permissao fina: STAFF com -content:write nao escreve
    const m = await ownerDb.clientMember.findFirstOrThrow({ where: { userId: x.w.staffAssignedA.id, clientId: x.w.clientA } });
    await ownerDb.clientMember.update({ where: { id: m.id }, data: { permissions: ["-content:write"] } });
    try {
      expect((await staff().patch(`${base()}/${id}`, { title: "x" })).status).toBe(403);
      expect((await staff().get(`${base()}/${id}`)).status).toBe(200);
    } finally {
      await ownerDb.clientMember.update({ where: { id: m.id }, data: { permissions: [] } });
    }
  });

  it("transicao invalida da 422 com a lista do que e permitido; cancelar sem justificativa 422; publicar sem URL nem evidencia 422", async () => {
    const bad = await staff().post(`${base()}/${id}/status`, { to: "AGENDADO" });
    expect(bad.status).toBe(422);
    expect(err(bad)?.code).toBe("INVALID_TRANSITION");
    expect((bad.json as { error: { allowed: string[] } }).error.allowed).toEqual(expect.arrayContaining(["EM_PRODUCAO", "CANCELADO"]));
    // aprovacao nunca a mao (nem pela agencia)
    expect((await staff().post(`${base()}/${id}/status`, { to: "APROVADO" })).status).toBe(422);
    expect((await staff().post(`${base()}/${id}/status`, { to: "EM_PRODUCAO" })).status).toBe(200);
    expect((await staff().post(`${base()}/${id}/status`, { to: "CANCELADO" })).status).toBe(422);
    expect((await staff().post(`${base()}/${id}/status`, { to: "CANCELADO", cancelReason: "curto" })).status).toBe(422);
    expect((await staff().post(`${base()}/${id}/status`, { to: "NAO_EXISTE" })).status).toBe(422);
    // envio sem rascunho: 422; com rascunho: vai para a fila
    expect((await staff().post(`${base()}/${id}/send`, {})).status).toBe(422);
    expect((await staff().put(`${base()}/${id}/material`, { caption: "legenda", cta: "Saiba mais", hashtags: ["a", "b"], briefing: "BRIEFING-DO-STAFF" })).status).toBe(200);
    expect((await staff().put(`${base()}/${id}/visibility`, { visibility: "COMPARTILHADO" })).status).toBe(200);
    const sent = await staff().post(`${base()}/${id}/send`, {});
    expect(sent.status).toBe(200);
    expect(sent.json).toMatchObject({ status: "AGUARDANDO_APROVACAO" });
    // versao enviada e imutavel: segundo envio sem novo rascunho recusado
    expect((await staff().post(`${base()}/${id}/send`, {})).status).toBe(422);
    // cliente aprova
    const versionId = ((await staff().get(`${base()}/${id}`)).json as { versions: { id: string }[] }).versions[0].id;
    const ok = await http(`/api/portal/contents/${id}/versions/${versionId}/decision`, { method: "POST", cookie: x.cookie.ownerA, body: { decision: "APROVADO" } });
    expect(ok.status).toBe(201);
    // publicar: exige data e URL HTTPS do canal (ou evidencia)
    expect((await staff().post(`${base()}/${id}/status`, { to: "PUBLICADO" })).status).toBe(422);
    expect((await staff().post(`${base()}/${id}/status`, { to: "PUBLICADO", publishedAt: new Date().toISOString() })).status).toBe(422);
    for (const url of ["http://www.instagram.com/p/x", "https://evil.example.com/p/x", "javascript:alert(1)", "https://127.0.0.1/p/x"]) {
      const r = await staff().post(`${base()}/${id}/status`, { to: "PUBLICADO", publishedAt: new Date().toISOString(), publicationUrl: url });
      expect(r.status, url).toBe(422);
    }
    const pub = await staff().post(`${base()}/${id}/status`, { to: "PUBLICADO", publishedAt: new Date().toISOString(), publicationUrl: "https://www.instagram.com/p/exemplo123/" });
    expect(pub.status).toBe(200);
    expect(await ownerDb.auditLog.count({ where: { entityId: id, action: "content.published" } })).toBe(1);
    // publicado: material nao se edita e nao cancela
    expect((await staff().put(`${base()}/${id}/material`, { caption: "mudar depois de publicar" })).status).toBe(422);
    expect((await staff().post(`${base()}/${id}/status`, { to: "CANCELADO", cancelReason: "cancelando depois de publicar" })).status).toBe(422);
    expect((await staff().post(`${base()}/${id}/status`, { to: "ANALISADO" })).status).toBe(200);
    // o cliente ve a URL de publicacao e o status, sem o briefing
    const detail = await http(`/api/portal/contents/${id}`, { cookie: x.cookie.ownerA });
    expect(detail.text).toContain("instagram.com/p/exemplo123");
    expect(detail.text).not.toContain("BRIEFING-DO-STAFF");
  });

  it("cancelamento com justificativa e terminal; auditado", async () => {
    const c = await staff().post(base(), { cycleId: x.a.cycleId, title: "Para cancelar", format: "ARTE", plannedOn: "2026-11-13" });
    const cid = (c.json as { id: string }).id;
    expect((await staff().post(`${base()}/${cid}/status`, { to: "CANCELADO", cancelReason: "cliente desistiu da campanha" })).status).toBe(200);
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: cid } })).cancelReason).toBe("cliente desistiu da campanha");
    const again = await staff().post(`${base()}/${cid}/status`, { to: "EM_PRODUCAO" });
    expect(again.status).toBe(422);
    expect(await ownerDb.auditLog.count({ where: { entityId: cid, action: "content.cancelled" } })).toBe(1);
  });

  it("calendario por competencia: a peca aparece no dia certo; reagendar fora do mes do ciclo e recusado; filtros por formato e status", async () => {
    const c = await staff().post(base(), { cycleId: x.a.cycleId, title: "Peca do calendario", format: "CARROSSEL", plannedOn: "2026-11-09" });
    const cid = (c.json as { id: string }).id;
    const cal = await staff().get(`/api/admin/clients/${x.w.clientA}/calendar?year=2026&month=11&format=CARROSSEL`);
    expect(cal.status).toBe(200);
    const items = (cal.json as { items: { id: string; plannedOn: string; format: string }[] }).items;
    expect(items.find((i) => i.id === cid)).toMatchObject({ plannedOn: "2026-11-09", format: "CARROSSEL" });
    expect(items.every((i) => i.format === "CARROSSEL")).toBe(true);
    expect(((await staff().get(`/api/admin/clients/${x.w.clientA}/calendar?year=2026&month=12`)).json as { items: unknown[] }).items).toHaveLength(0);
    expect((await staff().put(`${base()}/${cid}/schedule`, { plannedOn: "2026-12-05" })).status).toBe(422);
    expect((await staff().put(`${base()}/${cid}/schedule`, { plannedOn: "2026-02-31" })).status).toBe(422);
    expect((await staff().put(`${base()}/${cid}/schedule`, { plannedOn: "2026-11-21" })).status).toBe(200);
    const moved = await staff().get(`/api/admin/clients/${x.w.clientA}/calendar?year=2026&month=11&status=PLANEJADO`);
    expect((moved.json as { items: { id: string; plannedOn: string }[] }).items.find((i) => i.id === cid)?.plannedOn).toBe("2026-11-21");
    expect((await staff().get(`/api/admin/clients/${x.w.clientA}/calendar?year=2026&month=13`)).status).toBe(422);
    expect((await staff().get(`/api/admin/clients/${x.w.clientA}/calendar`)).status).toBe(422);
    // portal: so compartilhados
    expect((await http("/api/portal/calendar?year=2026&month=11", { cookie: x.cookie.ownerA })).text).not.toContain(cid);
  });

  it("lista paginada, filtrada e ordenada no servidor; filtro inexistente nao quebra", async () => {
    for (let i = 0; i < 6; i++) await staff().post(base(), { cycleId: x.a.cycleId, title: `Lista ${String.fromCharCode(70 - i)}`, format: "OUTRO", plannedOn: "2026-11-24" });
    const p1 = (await staff().get(`${base()}?q=Lista&format=OUTRO&sort=title&dir=desc&pageSize=4&page=1`)).json as { items: { title: string }[]; total: number; page: number; pageSize: number };
    expect(p1).toMatchObject({ total: 6, page: 1, pageSize: 4 });
    expect(p1.items.map((i) => i.title)).toEqual(["Lista F", "Lista E", "Lista D", "Lista C"]);
    const p2 = (await staff().get(`${base()}?q=Lista&format=OUTRO&sort=title&dir=desc&pageSize=4&page=2`)).json as { items: { title: string }[] };
    expect(p2.items.map((i) => i.title)).toEqual(["Lista B", "Lista A"]);
    expect(((await staff().get(`${base()}?status=ANALISADO`)).json as { total: number }).total).toBeGreaterThanOrEqual(1);
    for (const q of ["sort=senha", "status=XYZ", "pageSize=0", "from=2026-99-99", "cycleId=nao-uuid"]) expect((await staff().get(`${base()}?${q}`)).status, q).toBe(422);
    // a agencia ve campos de gestao; o formato do cliente nao os tem
    expect((await staff().get(`${base()}?pageSize=1`)).text).toContain("internalNotes");
  });
});

describe("P5: roteiros e gravacoes", () => {
  const S = () => `/api/admin/clients/${x.w.clientA}/scripts`;
  const staff = () => api(x.cookie.staffA);
  let sid: string;
  let recId: string;

  it("rascunho com cenas e referencias; cliente nao ve ate ENVIADO; transicao invalida 422 com lista", async () => {
    const bad = await staff().post(S(), { title: "Roteiro X", referenceLinks: ["javascript:alert(1)"] });
    expect(bad.status).toBe(422);
    const created = await staff().post(S(), {
      title: "Roteiro do video",
      objective: "OBJETIVO-DO-ROTEIRO",
      plannedDurationSeconds: 30,
      deadlineOn: "2026-11-20",
      referenceLinks: ["https://www.youtube.com/watch?v=exemplo"],
      checklist: [{ text: "Gravar na vertical", done: false }],
      scenes: [{ dialogue: "Ola!", action: "Entrada", durationSeconds: 5 }, { dialogue: "Fim", durationSeconds: 3 }],
    });
    expect(created.status).toBe(201);
    sid = (created.json as { id: string }).id;
    const detail = await staff().get(`${S()}/${sid}`);
    expect((detail.json as { script: { scenes: { position: number }[] } }).script.scenes.map((s) => s.position)).toEqual([0, 1]);
    // rascunho: o cliente nao lista nem abre
    expect((await http("/api/portal/scripts", { cookie: x.cookie.ownerA })).text).not.toContain(sid);
    expect((await http(`/api/portal/scripts/${sid}`, { cookie: x.cookie.ownerA })).status).toBe(404);
    const inv = await staff().post(`${S()}/${sid}/status`, { to: "GRAVACAO_RECEBIDA" });
    expect(inv.status).toBe(422);
    expect((inv.json as { error: { allowed: string[] } }).error.allowed).toContain("ENVIADO");
    expect((await staff().post(`${S()}/${sid}/status`, { to: "ENVIADO" })).status).toBe(200);
    // enviado: so a agencia edita... e roteiro nao em RASCUNHO nao se edita
    expect((await staff().patch(`${S()}/${sid}`, { title: "Mudou" })).status).toBe(422);
    expect((await staff().post(`${S()}/${sid}/status`, { to: "AGUARDANDO_GRAVACAO" })).status).toBe(200);
    const portal = await http(`/api/portal/scripts/${sid}`, { cookie: x.cookie.ownerA });
    expect(portal.status).toBe(200);
    expect(portal.text).toContain("Roteiro do video");
    expect(portal.json).toMatchObject({ script: { status: "AGUARDANDO_GRAVACAO" } });
    expect(portal.text).not.toContain("assigneeId");
    expect(await ownerDb.auditLog.count({ where: { entityId: sid, action: "script.status_changed" } })).toBe(2);
  });

  it("gravacao por link: so HTTPS de dominio autorizado, sem rede interna; fonte exata (arquivo OU link); o cliente do B nao envia", async () => {
    const owner = api(x.cookie.ownerA);
    const rec = (body: unknown) => owner.post(`/api/portal/scripts/${sid}/recordings`, body);
    for (const url of [
      "http://drive.google.com/file/d/1",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "//drive.google.com/x",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://169.254.169.254/latest/meta-data",
      "https://usuario:senha@drive.google.com/x",
      "https://drive.google.com:8443/x",
      "https://servidor.internal/x",
      "https://meuhost.local/x",
      "https://site-qualquer.example.com/gravacao",
      `https://drive.google.com/${"a".repeat(2100)}`,
    ]) {
      const r = await rec({ url });
      expect(r.status, url.slice(0, 50)).toBe(422);
      expectNoLeak(r);
    }
    expect((await rec({})).status).toBe(422);
    expect((await rec({ url: "https://drive.google.com/file/d/1", assetId: randomUUID() })).status).toBe(422);
    expect((await rec({ assetId: randomUUID() })).status).toBe(404);
    expect((await http(`/api/portal/scripts/${sid}/recordings`, { method: "POST", cookie: x.cookie.ownerB, body: { url: "https://drive.google.com/file/d/1" } })).status).toBe(404);
    expect(await ownerDb.recording.count({ where: { scriptId: sid } })).toBe(0);
    const ok = await rec({ url: "https://drive.google.com/file/d/gravacao-ficticia/view", imageRightsConfirmed: true });
    expect(ok.status).toBe(201);
    recId = (ok.json as { id: string }).id;
    const dup = await rec({ url: "https://drive.google.com/file/d/gravacao-ficticia/view", imageRightsConfirmed: true });
    expect(dup.status).toBe(200); // envio repetido: mesma gravacao
    expect((dup.json as { id: string }).id).toBe(recId);
    expect(await ownerDb.recording.count({ where: { scriptId: sid } })).toBe(1);
    const row = await ownerDb.recording.findUniqueOrThrow({ where: { id: recId } });
    expect(row).toMatchObject({ kind: "LINK", status: "ENVIADA", submittedById: x.w.ownerA.id });
    expect(row.imageRightsConfirmedAt).not.toBeNull();
  });

  it("gravacao por arquivo: so VIDEO disponivel que a pessoa ve; imagem, PDF e arquivo de outro sao recusados", async () => {
    // outro roteiro, para nao misturar com o anterior
    const s2 = (await staff().post(S(), { title: "Roteiro com arquivo" })).json as { id: string };
    await staff().post(`${S()}/${s2.id}/status`, { to: "ENVIADO" });
    await staff().post(`${S()}/${s2.id}/status`, { to: "AGUARDANDO_GRAVACAO" });
    const owner = api(x.cookie.ownerA);
    const video = mp4(400_000);
    const up = await uploadVia(x.cookie.ownerA, "/api/portal/assets", { originalName: "gravacao.mp4", mimeType: "video/mp4", bytes: video.length }, video);
    expect(up.put?.status).toBe(201);
    const img = await uploadVia(x.cookie.ownerA, "/api/portal/assets", { originalName: "foto.png", mimeType: "image/png", bytes: 100 }, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(92)]));
    expect((await owner.post(`/api/portal/scripts/${s2.id}/recordings`, { assetId: img.assetId })).status).toBe(404);
    // arquivo de outra pessoa do mesmo cliente (colega) nao serve
    const theirs = await uploadVia(x.cookie.collabA, "/api/portal/assets", { originalName: "dele.mp4", mimeType: "video/mp4", bytes: video.length }, video);
    expect((await owner.post(`/api/portal/scripts/${s2.id}/recordings`, { assetId: theirs.assetId })).status).toBe(404);
    const ok = await owner.post(`/api/portal/scripts/${s2.id}/recordings`, { assetId: up.assetId, imageRightsConfirmed: true });
    expect(ok.status).toBe(201);
    expect((await owner.post(`/api/portal/scripts/${s2.id}/recordings`, { assetId: up.assetId, imageRightsConfirmed: true })).status).toBe(200);
    expect(await ownerDb.assetLink.count({ where: { assetId: up.assetId!, role: "GRAVACAO" } })).toBe(1);
    // a agencia ve o arquivo da gravacao e baixa
    const view = await staff().get(`${S()}/${s2.id}`);
    expect(view.text).toContain(up.assetId!);
  });

  it("admin confirma (RECEBIDA, roteiro vai a GRAVACAO_RECEBIDA, auditado); cliente nao confirma; confirmar de novo 409", async () => {
    expect((await api(x.cookie.ownerA).post(`/api/admin/clients/${x.w.clientA}/recordings/${recId}/confirm`)).status).toBe(403);
    expect((await api(x.cookie.staffFree).post(`/api/admin/clients/${x.w.clientA}/recordings/${recId}/confirm`)).status).toBe(404);
    const ok = await staff().post(`/api/admin/clients/${x.w.clientA}/recordings/${recId}/confirm`);
    expect(ok.status).toBe(200);
    expect((await ownerDb.script.findUniqueOrThrow({ where: { id: sid } })).status).toBe("GRAVACAO_RECEBIDA");
    const log = await ownerDb.auditLog.findFirstOrThrow({ where: { action: "recording.confirmed", entityId: recId } });
    expect(log.actorId).toBe(x.w.staffAssignedA.id);
    expect((await staff().post(`/api/admin/clients/${x.w.clientA}/recordings/${recId}/confirm`)).status).toBe(409);
  });

  it("regravacao exige justificativa (visivel ao cliente); roteiro volta a AGUARDANDO_GRAVACAO; novo envio entra no historico", async () => {
    const url = `/api/admin/clients/${x.w.clientA}/recordings/${recId}/rerecording`;
    expect((await staff().post(url, { justification: "curto" })).status).toBe(422);
    expect((await staff().post(url, {})).status).toBe(422);
    expect((await api(x.cookie.ownerA).post(url, { justification: "justificativa suficiente" })).status).toBe(403);
    const ok = await staff().post(url, { justification: "audio com muito eco, gravar de novo" });
    expect(ok.status).toBe(200);
    expect((await ownerDb.script.findUniqueOrThrow({ where: { id: sid } })).status).toBe("AGUARDANDO_GRAVACAO");
    const portal = await http(`/api/portal/scripts/${sid}`, { cookie: x.cookie.collabA });
    expect(portal.text).toContain("audio com muito eco");
    const again = await api(x.cookie.collabA).post(`/api/portal/scripts/${sid}/recordings`, { url: "https://vimeo.com/123456" });
    expect(again.status).toBe(201);
    const list = (await http(`/api/portal/scripts/${sid}`, { cookie: x.cookie.ownerA })).json as { recordings: { status: string }[] };
    expect(list.recordings.map((r) => r.status)).toEqual(["REGRAVACAO_SOLICITADA", "ENVIADA"]);
    expect(await ownerDb.auditLog.count({ where: { entityId: recId, action: "recording.rerecording_requested" } })).toBe(1);
  });

  it("comentarios do roteiro: cliente so compartilhado; interno da agencia nao chega ao portal", async () => {
    expect((await staff().post(`${S()}/${sid}/comments`, { body: "NOTA-INTERNA-ROTEIRO" })).status).toBe(201);
    expect((await api(x.cookie.ownerA).post(`/api/portal/scripts/${sid}/comments`, { body: "duvida do cliente sobre a cena 2" })).status).toBe(201);
    expect((await api(x.cookie.ownerA).post(`/api/portal/scripts/${sid}/comments`, { body: "x", visibility: "INTERNO" })).status).toBe(403);
    const portal = await http(`/api/portal/scripts/${sid}`, { cookie: x.cookie.ownerA });
    expect(portal.text).toContain("duvida do cliente");
    expect(portal.text).not.toContain("NOTA-INTERNA-ROTEIRO");
    expect((await staff().get(`${S()}/${sid}`)).text).toContain("NOTA-INTERNA-ROTEIRO");
    expect(((await staff().get(`${S()}?status=AGUARDANDO_GRAVACAO&q=roteiro&sort=title&dir=asc`)).json as { total: number }).total).toBeGreaterThanOrEqual(1);
  });
});
