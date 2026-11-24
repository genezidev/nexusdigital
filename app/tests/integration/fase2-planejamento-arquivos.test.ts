import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveTenantContext, type TenantContext } from "@/server/authorization/context";
import { ConflictError, DomainRuleError, ForbiddenError, NotFoundError } from "@/server/errors";
import type { Actor } from "@/server/services/access";
import { attachAsset, authorizeDownload, createPendingAsset, deleteAsset, detachAsset, finalizeAsset } from "@/server/services/assets";
import { addComment, classifyContent, createContent, editMaterial, getContentDetail, rescheduleContent, sendVersion, transitionContent } from "@/server/services/contents";
import { adjustCycleQuota, changeSubscription, closeCycle, createPlan, createPlanVersion, createSubscription, getCycleProgress, listCatalog, openCycle, reopenCycle } from "@/server/services/planning";
import { confirmRecording, createScript, editScript, getScriptDetail, requestRerecording, submitRecording, transitionScript } from "@/server/services/scripts";
import { appDb, makeClient, makeUser, makeWorld, ownerDb, addMember, type World } from "./helpers/world";
import { makePhase2, sys, type Phase2Data } from "./helpers/phase2";

const actor = (u: { id: string; email: string }, role: Actor["role"]): Actor => ({ userId: u.id, role, name: "x", email: u.email });
const planInput = (code: string) => ({ code, name: `Plano ${code}`, monthlyAmountCents: 150000, monthlyQuota: 12, revisionsPerPiece: 2, approvalDeadlineBusinessDays: 3, scope: "Escopo ficticio", exclusions: "Exclusoes ficticias" });
const auditOf = (action: string, entityId: string) => ownerDb.auditLog.findMany({ where: { action, entityId } });

describe("fase 2, plano, assinatura e ciclo", () => {
  let w: World;
  let admin: TenantContext;
  let staff: TenantContext;
  let owner: TenantContext;
  let planId: string;
  let subId: string;
  let cycleId: string;

  beforeAll(async () => {
    w = await makeWorld();
    admin = await resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: w.clientA });
    staff = await resolveTenantContext(appDb, { userId: w.staffAssignedA.id, activeClientId: w.clientA });
    owner = await resolveTenantContext(appDb, { userId: w.ownerA.id, activeClientId: w.clientA });
  });

  it("plano: so ADMIN cria e versiona; STAFF le o catalogo; cliente nao; cada mudanca e auditada sem client_id", async () => {
    const code = `essencial-${randomUUID().slice(0, 6)}`;
    const plan = await createPlan(appDb, actor(w.admin, "ADMIN"), planInput(code));
    planId = plan.id;
    await expect(createPlan(appDb, actor(w.staffAssignedA, "STAFF"), planInput(`${code}-s`))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createPlan(appDb, actor(w.ownerA, "USER"), planInput(`${code}-u`))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createPlan(appDb, actor(w.admin, "ADMIN"), planInput(code))).rejects.toBeInstanceOf(ConflictError);
    expect((await listCatalog(appDb, actor(w.staffAssignedA, "STAFF"))).some((p) => p.id === plan.id)).toBe(true);
    await expect(listCatalog(appDb, actor(w.ownerA, "USER"))).rejects.toBeInstanceOf(ForbiddenError);
    const log = await auditOf("plan.created", plan.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ clientId: null, actorId: w.admin.id });
  });

  it("plano publicado nao e editado nem apagado (gatilho, ate para o dono do banco); mudar cria versao nova e desativa a anterior", async () => {
    const plan = await ownerDb.servicePlan.findUniqueOrThrow({ where: { id: planId } });
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE service_plans SET monthly_amount_cents = 1 WHERE id = '${planId}'`))).rejects.toThrow(/nao e editado/i);
    await expect(sys((tx) => tx.$executeRawUnsafe(`DELETE FROM service_plans WHERE id = '${planId}'`))).rejects.toThrow(/nao e apagado/i);
    const v2 = await createPlanVersion(appDb, actor(w.admin, "ADMIN"), plan.code, { ...planInput(plan.code), monthlyAmountCents: 180000 });
    expect(v2.version).toBe(2);
    expect((await ownerDb.servicePlan.findUniqueOrThrow({ where: { id: planId } })).active).toBe(false);
    expect(await auditOf("plan.version_created", v2.id)).toHaveLength(1);
    // reativar a v1 para os testes seguintes (so o campo active muda)
    await sys((tx) => tx.servicePlan.update({ where: { id: planId }, data: { active: true } }));
  });

  it("assinatura: copia o retrato do plano, so ADMIN cria, audita, e um cliente tem no maximo UMA ativa (409)", async () => {
    await expect(createSubscription(appDb, staff, { planId, startsOn: new Date("2026-11-10T00:00:00Z"), billingDay: 10 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createSubscription(appDb, owner, { planId, startsOn: new Date("2026-11-10T00:00:00Z"), billingDay: 10 })).rejects.toBeInstanceOf(ForbiddenError);
    const sub = await createSubscription(appDb, admin, { planId, startsOn: new Date("2026-11-10T00:00:00Z"), billingDay: 10 });
    subId = sub.id;
    expect(sub).toMatchObject({ amountCents: 150000, quota: 12, planVersion: 1, status: "ATIVA" });
    expect(await auditOf("subscription.created", sub.id)).toHaveLength(1);
    await expect(createSubscription(appDb, admin, { planId, startsOn: new Date("2027-01-10T00:00:00Z"), billingDay: 10 })).rejects.toMatchObject({ code: "SUBSCRIPTION_ACTIVE_EXISTS" });
    // duas ao mesmo tempo em outro cliente: so uma nasce
    const other = await makeClient("C");
    const ownerU = await makeUser("USER", "dono-c");
    await addMember(other, ownerU.id, "CLIENT_OWNER");
    const adminC = await resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: other });
    const r = await Promise.allSettled([1, 2].map(() => createSubscription(appDb, adminC, { planId, startsOn: new Date("2026-11-10T00:00:00Z"), billingDay: 5 })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await ownerDb.subscription.count({ where: { clientId: other, status: "ATIVA" } })).toBe(1);
  });

  it("o retrato e congelado: plano novo nao muda a assinatura; o banco recusa editar valor, escopo ou plano", async () => {
    const sub = await ownerDb.subscription.findUniqueOrThrow({ where: { id: subId } });
    expect(sub.amountCents).toBe(150000);
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE subscriptions SET amount_cents = 1 WHERE id = '${subId}'`))).rejects.toThrow(/congelado/i);
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE subscriptions SET scope_snapshot = 'x' WHERE id = '${subId}'`))).rejects.toThrow(/congelado/i);
    await changeSubscription(appDb, admin, subId, { billingDay: 12 });
    expect(await auditOf("subscription.updated", subId)).toHaveLength(1);
    await expect(changeSubscription(appDb, staff, subId, { billingDay: 13 })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("ciclo: cota copiada da assinatura, duplicado e 409, simultaneos criam um so, fora da vigencia e 422", async () => {
    const c = await openCycle(appDb, admin, { subscriptionId: subId, year: 2026, month: 11 });
    cycleId = c.id;
    expect(c.quota).toBe(12);
    expect(await auditOf("cycle.created", c.id)).toHaveLength(1);
    await expect(openCycle(appDb, admin, { subscriptionId: subId, year: 2026, month: 11 })).rejects.toMatchObject({ code: "CYCLE_EXISTS" });
    const sim = await Promise.allSettled([1, 2, 3].map(() => openCycle(appDb, admin, { subscriptionId: subId, year: 2026, month: 12 })));
    expect(sim.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await ownerDb.editorialCycle.count({ where: { subscriptionId: subId, year: 2026, month: 12 } })).toBe(1);
    await expect(openCycle(appDb, admin, { subscriptionId: subId, year: 2026, month: 9 })).rejects.toMatchObject({ code: "CYCLE_OUTSIDE_SUBSCRIPTION" });
    await expect(openCycle(appDb, staff, { subscriptionId: subId, year: 2027, month: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sys((tx) => tx.editorialCycle.create({ data: { clientId: w.clientA, subscriptionId: subId, year: 2026, month: 11, quota: 1 } }))).rejects.toThrow(/Unique constraint/i);
  });

  it("cota do ciclo: ajuste so do ADMIN, com justificativa, guarda o valor anterior e audita; ciclo nao muda com o plano", async () => {
    await expect(adjustCycleQuota(appDb, admin, cycleId, 10, "curta")).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await expect(adjustCycleQuota(appDb, staff, cycleId, 10, "primeiro ciclo parcial proporcional")).rejects.toBeInstanceOf(ForbiddenError);
    await adjustCycleQuota(appDb, admin, cycleId, 10, "primeiro ciclo parcial proporcional");
    const c = await ownerDb.editorialCycle.findUniqueOrThrow({ where: { id: cycleId } });
    expect(c).toMatchObject({ quota: 10, previousQuota: 12 });
    expect(await auditOf("cycle.quota_adjusted", cycleId)).toHaveLength(1);
    await adjustCycleQuota(appDb, admin, cycleId, 12, "voltou a cota cheia do contrato");
  });

  it("conteudo: Story nasce fora da cota, STAFF cria mas nao classifica, ADMIN classifica com auditoria do antes e depois", async () => {
    const story = await createContent(appDb, staff, { cycleId, title: "Story fictício", format: "STORY", plannedOn: new Date("2026-11-12T00:00:00Z") });
    expect(story.countsTowardQuota).toBe(false);
    const arte = await createContent(appDb, staff, { cycleId, title: "Arte fictícia", format: "ARTE", plannedOn: new Date("2026-11-13T00:00:00Z") });
    expect(arte.countsTowardQuota).toBe(true);
    await expect(createContent(appDb, owner, { cycleId, title: "x", format: "ARTE", plannedOn: new Date("2026-11-13T00:00:00Z") })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createContent(appDb, staff, { cycleId, title: "fora do mes", format: "ARTE", plannedOn: new Date("2026-12-01T00:00:00Z") })).rejects.toMatchObject({ code: "OUTSIDE_CYCLE_MONTH" });
    await expect(classifyContent(appDb, staff, arte.id, { isBonus: true })).rejects.toBeInstanceOf(ForbiddenError);
    await classifyContent(appDb, admin, arte.id, { isBonus: true });
    const log = (await auditOf("content.classification_changed", arte.id))[0];
    expect(log.diff).toMatchObject({ from: { isBonus: false }, to: { isBonus: true } });
    expect(log.actorId).toBe(w.admin.id);
  });

  it("transicoes: invalida devolve a lista permitida; cancelar exige justificativa; publicar exige URL/evidencia e data; tudo auditado", async () => {
    const c = await createContent(appDb, admin, { cycleId, title: "Fluxo", format: "CARROSSEL", plannedOn: new Date("2026-11-16T00:00:00Z") });
    await expect(transitionContent(appDb, admin, c.id, "PUBLICADO")).rejects.toMatchObject({ code: "INVALID_TRANSITION", allowed: ["EM_PRODUCAO", "CANCELADO"] });
    await expect(transitionContent(appDb, admin, c.id, "APROVADO")).rejects.toBeInstanceOf(DomainRuleError);
    await expect(transitionContent(appDb, owner, c.id, "EM_PRODUCAO")).rejects.toBeInstanceOf(ForbiddenError);
    await transitionContent(appDb, admin, c.id, "EM_PRODUCAO");
    await editMaterial(appDb, staff, c.id, { caption: "legenda", hashtags: ["a"] });
    await sendVersion(appDb, staff, c.id);
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("AGUARDANDO_APROVACAO");
    await expect(transitionContent(appDb, admin, c.id, "CANCELADO")).rejects.toMatchObject({ code: "CANCEL_REASON_REQUIRED" });
    await expect(transitionContent(appDb, admin, c.id, "CANCELADO", { cancelReason: "curto" })).rejects.toMatchObject({ code: "CANCEL_REASON_REQUIRED" });
    // Aprovado (sistema) -> publicar
    await sys((tx) => tx.content.update({ where: { id: c.id }, data: { status: "APROVADO" } }));
    await expect(transitionContent(appDb, admin, c.id, "PUBLICADO", { publishedAt: new Date() })).rejects.toMatchObject({ code: "PUBLICATION_DATA_REQUIRED" });
    await expect(transitionContent(appDb, admin, c.id, "PUBLICADO", { publicationUrl: "https://www.instagram.com/p/ficticio/" })).rejects.toMatchObject({ code: "PUBLICATION_DATA_REQUIRED" });
    await expect(transitionContent(appDb, admin, c.id, "PUBLICADO", { publishedAt: new Date(), publicationUrl: "http://www.instagram.com/p/x/" })).rejects.toMatchObject({ code: "PUBLICATION_URL_INVALID" });
    await transitionContent(appDb, admin, c.id, "PUBLICADO", { publishedAt: new Date(), publicationUrl: "https://www.instagram.com/p/ficticio/" });
    expect(await auditOf("content.published", c.id)).toHaveLength(1);
    await transitionContent(appDb, admin, c.id, "ANALISADO");
    await expect(rescheduleContent(appDb, admin, c.id, "2026-11-01", new Date("2026-11-24T00:00:00Z"))).rejects.toMatchObject({ code: "PUBLISHED_IN_PAST" });

    const d = await createContent(appDb, admin, { cycleId, title: "Cancelar", format: "ARTE", plannedOn: new Date("2026-11-17T00:00:00Z") });
    await transitionContent(appDb, admin, d.id, "CANCELADO", { cancelReason: "cliente desistiu da peca" });
    expect(await auditOf("content.cancelled", d.id)).toHaveLength(1);
    await expect(transitionContent(appDb, admin, d.id, "EM_PRODUCAO")).rejects.toMatchObject({ code: "TERMINAL" });
    await expect(rescheduleContent(appDb, admin, d.id, "2026-11-20")).rejects.toMatchObject({ code: "CANCELLED" });
    const e = await createContent(appDb, admin, { cycleId, title: "Reagendar", format: "ARTE", plannedOn: new Date("2026-11-18T00:00:00Z") });
    await expect(rescheduleContent(appDb, admin, e.id, "2026-12-02")).rejects.toMatchObject({ code: "OUTSIDE_CYCLE_MONTH" });
    await rescheduleContent(appDb, admin, e.id, "2026-11-25");
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: e.id } })).plannedOn.toISOString().slice(0, 10)).toBe("2026-11-25");
  });

  it("progresso: o exemplo da spec (7 de 12 = 58%, 2 fora da cota) calculado a partir do banco, e o portal ve os numeros mesmo com pecas internas", async () => {
    const other = await makeClient("P");
    const ownerP = await makeUser("USER", "dono-p");
    await addMember(other, ownerP.id, "CLIENT_OWNER");
    const adminP = await resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: other });
    const sub = await createSubscription(appDb, adminP, { planId, startsOn: new Date("2026-11-01T00:00:00Z"), billingDay: 5 });
    const cyc = await openCycle(appDb, adminP, { subscriptionId: sub.id, year: 2026, month: 11 });
    const mk = async (n: number, status: string, extra: Record<string, unknown> = {}) => {
      for (let i = 0; i < n; i++) {
        await sys((tx) =>
          tx.content.create({
            data: {
              clientId: other, cycleId: cyc.id, title: `p-${status}-${i}`, format: "ARTE", plannedOn: new Date("2026-11-10T00:00:00Z"), status: status as never,
              ...(status === "PUBLICADO" || status === "ANALISADO" ? { publishedAt: new Date() } : {}),
              ...(status === "CANCELADO" ? { cancelReason: "cancelado de exemplo", cancelledAt: new Date() } : {}),
              ...extra,
            },
          }),
        );
      }
    };
    await mk(5, "PUBLICADO");
    await mk(2, "ANALISADO");
    await mk(1, "APROVADO");
    await mk(1, "AGENDADO");
    await mk(1, "AGUARDANDO_APROVACAO");
    await mk(1, "EM_REVISAO");
    await mk(1, "EM_PRODUCAO");
    await mk(1, "PUBLICADO", { countsTowardQuota: false, title: "story" });
    await mk(1, "PUBLICADO", { isBonus: true, title: "bonus" });
    await mk(2, "CANCELADO");
    const client = await resolveTenantContext(appDb, { userId: ownerP.id, activeClientId: other });
    // todas as pecas sao INTERNAS: o cliente nao lista nenhuma, mas ve os numeros
    const p = await getCycleProgress(appDb, client, cyc.id);
    expect(p).toMatchObject({ planned: 12, produced: 11, approved: 9, published: 7, percent: 58, surplus: 0, quota: 12, source: "live" });
    expect(p.outsideQuota.published).toBe(2);
    // encerrar guarda o retrato; mudar a classificacao depois nao altera o historico
    await expect(closeCycle(appDb, client, cyc.id)).rejects.toBeInstanceOf(ForbiddenError);
    await closeCycle(appDb, adminP, cyc.id);
    expect(await auditOf("cycle.closed", cyc.id)).toHaveLength(1);
    await sys((tx) => tx.content.updateMany({ where: { cycleId: cyc.id, status: { not: "CANCELADO" } }, data: { countsTowardQuota: false } }));
    const depois = await getCycleProgress(appDb, client, cyc.id);
    expect(depois).toMatchObject({ published: 7, percent: 58, source: "snapshot" });
    // ciclo encerrado: nada muda, nem cota, nem conteudo novo; reabrir exige justificativa
    await expect(adjustCycleQuota(appDb, adminP, cyc.id, 5, "tentando mexer no encerrado")).rejects.toMatchObject({ code: "CYCLE_CLOSED" });
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE editorial_cycles SET quota = 1 WHERE id = '${cyc.id}'`))).rejects.toThrow(/encerrado nao muda/i);
    await expect(createContent(appDb, adminP, { cycleId: cyc.id, title: "tarde", format: "ARTE", plannedOn: new Date("2026-11-20T00:00:00Z") })).rejects.toMatchObject({ code: "CYCLE_CLOSED" });
    await expect(reopenCycle(appDb, adminP, cyc.id, "curta")).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await reopenCycle(appDb, adminP, cyc.id, "reabrindo para corrigir a classificacao");
    expect(await auditOf("cycle.reopened", cyc.id)).toHaveLength(1);
    expect((await getCycleProgress(appDb, client, cyc.id)).source).toBe("live");
  });

  it("cota zero: o portal recebe 'sem cota definida' sem dividir por zero", async () => {
    const other = await makeClient("Z");
    const ownerZ = await makeUser("USER", "dono-z");
    await addMember(other, ownerZ.id, "CLIENT_OWNER");
    const cyc = await sys(async (tx) => {
      const s = await tx.subscription.create({ data: { clientId: other, planId, planCode: "x-y", planName: "x", planVersion: 1, scopeSnapshot: "x", amountCents: 0, quota: 0, revisionsPerPiece: 0, approvalDeadlineBusinessDays: 0, startsOn: new Date("2026-11-01T00:00:00Z"), billingDay: 1 } });
      return tx.editorialCycle.create({ data: { clientId: other, subscriptionId: s.id, year: 2026, month: 11, quota: 0 } });
    });
    const p = await getCycleProgress(appDb, await resolveTenantContext(appDb, { userId: ownerZ.id, activeClientId: other }), cyc.id);
    expect(p).toMatchObject({ hasQuota: false, percent: null, surplus: 0 });
  });
});

describe("fase 2, roteiros, gravacoes e arquivos", () => {
  let w: World;
  let a: Phase2Data;
  let admin: TenantContext;
  let staff: TenantContext;
  let owner: TenantContext;
  let collab: TenantContext;

  beforeAll(async () => {
    w = await makeWorld();
    a = await makePhase2(w.clientA, w.admin.id, w.ownerA.id);
    admin = await resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: w.clientA });
    staff = await resolveTenantContext(appDb, { userId: w.staffAssignedA.id, activeClientId: w.clientA });
    owner = await resolveTenantContext(appDb, { userId: w.ownerA.id, activeClientId: w.clientA });
    collab = await resolveTenantContext(appDb, { userId: w.collabA.id, activeClientId: w.clientA });
  });

  it("roteiro: cliente nao cria nem edita; em RASCUNHO nao aparece; so se edita em RASCUNHO; regravacao e confirmacao seguem o fluxo e sao auditadas", async () => {
    await expect(createScript(appDb, owner, { title: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    const s = await createScript(appDb, staff, { title: "Roteiro fluxo", objective: "OBJETIVO-ROTEIRO-INTERNO", referenceLinks: ["https://exemplo.com.br/ref"] });
    await expect(createScript(appDb, staff, { title: "x", referenceLinks: ["http://exemplo.com.br/ref"] })).rejects.toMatchObject({ code: "INVALID_LINK" });
    await editScript(appDb, staff, s.id, { location: "Estudio" }, [{ dialogue: "fala 1", action: "acao 1", durationSeconds: 5 }, { dialogue: "fala 2" }]);
    expect((await getScriptDetail(appDb, admin, s.id)).script.scenes).toHaveLength(2);
    await expect(getScriptDetail(appDb, owner, s.id)).rejects.toBeInstanceOf(NotFoundError); // RASCUNHO e interno
    await expect(transitionScript(appDb, staff, s.id, "AGUARDANDO_GRAVACAO")).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    await transitionScript(appDb, staff, s.id, "ENVIADO");
    await expect(editScript(appDb, staff, s.id, { location: "outro" })).rejects.toMatchObject({ code: "SCRIPT_LOCKED" });
    expect(JSON.stringify(await getScriptDetail(appDb, owner, s.id))).toBeTruthy(); // a partir de ENVIADO o cliente ve
    await transitionScript(appDb, staff, s.id, "AGUARDANDO_GRAVACAO");

    // gravacao por link: so https de dominio autorizado
    for (const url of ["http://drive.google.com/x", "https://127.0.0.1/x", "https://exemplo-qualquer.com/x", "javascript:alert(1)", "https://169.254.169.254/x"]) {
      await expect(submitRecording(appDb, owner, { scriptId: s.id, url }), url).rejects.toMatchObject({ code: "INVALID_LINK" });
    }
    await expect(submitRecording(appDb, owner, { scriptId: s.id })).rejects.toMatchObject({ code: "RECORDING_SOURCE" });
    const rec = await submitRecording(appDb, collab, { scriptId: s.id, url: "https://drive.google.com/file/d/ficticio", imageRightsConfirmed: true });
    expect((await ownerDb.recording.findUniqueOrThrow({ where: { id: rec.id } })).imageRightsConfirmedAt).not.toBeNull();
    await expect(confirmRecording(appDb, owner, rec.id)).rejects.toBeInstanceOf(ForbiddenError);
    await confirmRecording(appDb, staff, rec.id);
    expect((await ownerDb.script.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("GRAVACAO_RECEBIDA");
    const conf = (await auditOf("recording.confirmed", rec.id))[0];
    expect(conf).toMatchObject({ actorId: w.staffAssignedA.id, clientId: w.clientA });
    await expect(confirmRecording(appDb, staff, rec.id)).rejects.toBeInstanceOf(ConflictError);

    await expect(requestRerecording(appDb, staff, rec.id, "curta")).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await requestRerecording(appDb, staff, rec.id, "a luz estava errada na cena 2, regravar");
    expect((await ownerDb.script.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("AGUARDANDO_GRAVACAO");
    const detail = await getScriptDetail(appDb, owner, s.id);
    expect(JSON.stringify(detail.recordings)).toContain("a luz estava errada"); // a justificativa e visivel ao cliente
    expect(await auditOf("recording.rerecording_requested", rec.id)).toHaveLength(1);
    // historico de gravacoes preservado e o banco recusa mexer nos campos do envio
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE recordings SET external_url = 'https://vimeo.com/9' WHERE id = '${rec.id}'`))).rejects.toThrow(/so a revisao/i);
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE recordings SET status = 'ENVIADA' WHERE id = '${rec.id}'`))).rejects.toThrow(/transicao/i);
  });

  it("roteiro ligado a conteudo: FINALIZADO e PUBLICADO exigem o estado do conteudo", async () => {
    const s = await createScript(appDb, admin, { title: "Ligado", contentId: a.contentShared });
    await sys((tx) => tx.script.update({ where: { id: s.id }, data: { status: "AGUARDANDO_APROVACAO" } }));
    await expect(transitionScript(appDb, admin, s.id, "FINALIZADO")).rejects.toMatchObject({ code: "LINKED_CONTENT_STATE" });
    await sys((tx) => tx.content.update({ where: { id: a.contentShared }, data: { status: "APROVADO" } }));
    await transitionScript(appDb, admin, s.id, "FINALIZADO");
    await expect(transitionScript(appDb, admin, s.id, "PUBLICADO")).rejects.toMatchObject({ code: "LINKED_CONTENT_STATE" });
  });

  it("arquivo: extensao perigosa e tipo fora da lista sao recusados; finalizar valida e so entao fica DISPONIVEL; PENDENTE nao baixa nem vincula", async () => {
    await expect(createPendingAsset(appDb, owner, { originalName: "foto.jpg.exe" })).rejects.toMatchObject({ code: "BLOCKED_EXTENSION" });
    const bad = await createPendingAsset(appDb, owner, { originalName: "pagina.png" });
    await expect(finalizeAsset(appDb, owner, bad.id, { mimeType: "text/html", bytes: 100, checksumSha256: "c".repeat(64) })).rejects.toMatchObject({ code: "TYPE_NOT_ALLOWED" });
    expect((await ownerDb.asset.findUniqueOrThrow({ where: { id: bad.id } })).status).toBe("REJEITADO");
    expect(await auditOf("asset.rejected", bad.id)).toHaveLength(1);

    const big = await createPendingAsset(appDb, owner, { originalName: "grande.png" });
    await expect(finalizeAsset(appDb, owner, big.id, { mimeType: "image/png", bytes: 21 * 1024 * 1024, checksumSha256: "c".repeat(64) })).rejects.toMatchObject({ code: "TOO_LARGE" });

    const ok = await createPendingAsset(appDb, owner, { originalName: "gravacao.mp4" });
    expect(ok.storageKey).toMatch(new RegExp(`^clients/${w.clientA}/[0-9a-f-]{36}$`));
    await expect(authorizeDownload(appDb, owner, ok.id)).rejects.toBeInstanceOf(NotFoundError); // PENDENTE nunca baixa
    await finalizeAsset(appDb, owner, ok.id, { mimeType: "video/mp4", bytes: 1_000_000, checksumSha256: "d".repeat(64) });
    expect((await authorizeDownload(appDb, owner, ok.id)).storageKey).toBe(ok.storageKey);
    // quem nao ve o arquivo (colega que nao enviou e arquivo sem vinculo visivel) recebe 404
    await expect(authorizeDownload(appDb, collab, ok.id)).rejects.toBeInstanceOf(NotFoundError);
    // os campos validados nao mudam depois
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE assets SET bytes = 5 WHERE id = '${ok.id}'`))).rejects.toThrow(/nao muda/i);
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE assets SET storage_key = 'clients/${w.clientA}/${randomUUID()}' WHERE id = '${ok.id}'`))).rejects.toThrow(/nao mudam/i);
    // o cliente nao muda o scan_status do proprio arquivo
    await expect(withScan(owner, ok.id)).rejects.toThrow(/so a agencia muda o scan_status/i);
    // PENDENTE nao vincula (gatilho)
    const pend = await createPendingAsset(appDb, admin, { originalName: "previa.png" });
    await expect(attachAsset(appDb, admin, { assetId: pend.id, role: "PREVIA", versionId: a.versionDraft })).rejects.toThrow();
  });

  async function withScan(ctx: TenantContext, id: string) {
    const { withTenant } = await import("@/server/db/scope");
    return withTenant(appDb, ctx, ({ tx }) => tx.$executeRawUnsafe(`UPDATE assets SET scan_status = 'LIMPO' WHERE id = '${id}'`));
  }

  it("arquivo ligado a versao ENVIADA: nao troca, nao sai, nao entra novo vinculo e nao e excluido; a saida e nova versao", async () => {
    // a.linkSent foi criado quando a versao ainda era rascunho
    await expect(detachAsset(appDb, admin, a.linkSent)).rejects.toThrow(/ENVIADA nao troca nem sai/i);
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE asset_links SET position = 4 WHERE id = '${a.linkSent}'`))).rejects.toThrow(/ENVIADA/i);
    await expect(deleteAsset(appDb, admin, a.assetAvailable)).rejects.toThrow(/ligado a versao enviada/i);
    const extra = await createPendingAsset(appDb, admin, { originalName: "extra.png" });
    await finalizeAsset(appDb, admin, extra.id, { mimeType: "image/png", bytes: 500, checksumSha256: "e".repeat(64) });
    await expect(attachAsset(appDb, admin, { assetId: extra.id, role: "PREVIA", versionId: a.versionSent, position: 1 })).rejects.toThrow(/ENVIADA nao aceita vinculo novo/i);
    // rascunho: vincula, reordena (so position) e remove
    const l = await attachAsset(appDb, admin, { assetId: extra.id, role: "PREVIA", versionId: a.versionDraft, position: 1 });
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE asset_links SET role = 'FINAL' WHERE id = '${l.id}'`))).rejects.toThrow(/so a ordem/i);
    await detachAsset(appDb, admin, l.id);
    // nova versao copia os vinculos: editar material depois do envio leva o arquivo junto
    const e = await editMaterial(appDb, admin, a.contentShared, { cta: "novo cta" });
    expect(await ownerDb.assetLink.count({ where: { versionId: e.versionId } })).toBe(1);
    // exclusao: so quem enviou ou ADMIN; arquivo sem vinculo exclui
    const own = await createPendingAsset(appDb, owner, { originalName: "meu.png" });
    await expect(deleteAsset(appDb, collab, own.id)).rejects.toBeInstanceOf(ForbiddenError);
    await deleteAsset(appDb, owner, own.id);
    expect((await ownerDb.asset.findUniqueOrThrow({ where: { id: own.id } })).status).toBe("EXCLUIDO");
    expect(await auditOf("asset.deleted", own.id)).toHaveLength(1);
    await expect(sys((tx) => tx.$executeRawUnsafe(`UPDATE assets SET status = 'PENDENTE' WHERE id = '${own.id}'`))).rejects.toThrow(/terminal/i);
  });

  it("comentario em conteudo compartilhado por colaborador entra como compartilhado e conta no detalhe do cliente", async () => {
    await addComment(appDb, collab, { contentId: a.contentShared, body: "gostei da arte", visibility: "COMPARTILHADO" });
    expect(JSON.stringify(await getContentDetail(appDb, owner, a.contentShared))).toContain("gostei da arte");
  });
});
