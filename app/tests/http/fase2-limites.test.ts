import { beforeAll, describe, expect, it } from "vitest";
import { makeAwaitingContent } from "../integration/helpers/phase2";
import { BASE_MUT, err, http, login } from "./helpers/http";
import { addMember, makePhase2World, makeUser, ownerDb, png, type Phase2World } from "./helpers/phase2";

// B-5: limite por PESSOA (nunca global) nas mutacoes que enchiam o banco e a auditoria append-only: decisao,
// comentario, gravacao, criacao de conteudo e o PUT dos bytes. Instancia `BASE_MUT` (tests/http/global-setup.ts):
// decisao 2, comentario 3, gravacao 2, criacao de conteudo 3 e PUT 2 por janela de 10 minutos.

let x: Phase2World;
beforeAll(async () => {
  x = await makePhase2World();
});

async function newMember(role: "CLIENT_OWNER" | "CLIENT_COLLABORATOR", label: string) {
  const u = await makeUser("USER", label);
  await addMember(x.w.clientA, u.id, role);
  return { ...u, cookie: await login(u.email) };
}
const call = (cookie: string, method: string, path: string, body?: unknown) => http(path, { method, cookie, body, base: BASE_MUT });
const rateLimited = (r: { status: number; headers: Headers; json: unknown }) => {
  expect(r.status).toBe(429);
  expect(err(r as never)?.code).toBe("RATE_LIMITED");
  expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
};

describe("decisao de aprovacao", () => {
  it("a terceira decisao da mesma pessoa em 10 min recebe 429 e nada e gravado; outra pessoa nao e afetada", async () => {
    const owner = await newMember("CLIENT_OWNER", "dono-limite");
    const other = await newMember("CLIENT_OWNER", "dono-livre");
    const decide = (cookie: string, c: { contentId: string; versionId: string }) =>
      call(cookie, "POST", `/api/portal/contents/${c.contentId}/versions/${c.versionId}/decision`, { decision: "APROVADO" });
    const c = await Promise.all([1, 2, 3, 4].map(() => makeAwaitingContent(x.w.clientA, x.a.cycleId, x.w.admin.id)));
    expect((await decide(owner.cookie, c[0])).status).toBe(201);
    expect((await decide(owner.cookie, c[1])).status).toBe(201);
    const blocked = await decide(owner.cookie, c[2]);
    rateLimited(blocked);
    expect(await ownerDb.approval.count({ where: { contentId: c[2].contentId } })).toBe(0);
    expect((await ownerDb.content.findUniqueOrThrow({ where: { id: c[2].contentId } })).status).toBe("AGUARDANDO_APROVACAO");
    // outra pessoa do mesmo cliente: balde proprio
    expect((await decide(other.cookie, c[2])).status).toBe(201);
    // o limite de decisao nao afeta a leitura nem os outros baldes (comentario)
    expect((await call(owner.cookie, "GET", "/api/portal/approvals")).status).toBe(200);
  });
});

describe("comentarios (conteudo e roteiro dividem o mesmo balde)", () => {
  it("o quarto comentario em 10 min recebe 429; a agencia (outra pessoa) continua comentando", async () => {
    const owner = await newMember("CLIENT_COLLABORATOR", "colab-comenta");
    const onContent = (cookie: string, body: string) => call(cookie, "POST", `/api/portal/contents/${x.a.contentShared}/comments`, { body });
    expect((await onContent(owner.cookie, "um")).status).toBe(201);
    expect((await onContent(owner.cookie, "dois")).status).toBe(201);
    expect((await call(owner.cookie, "POST", `/api/portal/scripts/${x.a.scriptSent}/comments`, { body: "tres, no roteiro" })).status).toBe(201);
    rateLimited(await onContent(owner.cookie, "quatro"));
    rateLimited(await call(owner.cookie, "POST", `/api/portal/scripts/${x.a.scriptSent}/comments`, { body: "cinco, no roteiro" }));
    expect(await ownerDb.comment.count({ where: { authorId: owner.id } })).toBe(3);
    // a agencia e outra pessoa (e passa pela porta admin)
    const adminComment = await call(x.cookie.admin, "POST", `/api/admin/clients/${x.w.clientA}/contents/${x.a.contentShared}/comments`, { body: "agencia" });
    expect(adminComment.status).toBe(201);
  });
});

describe("gravacoes (cada uma com URL diferente enchia a auditoria)", () => {
  it("a terceira gravacao em 10 min recebe 429; a auditoria nao passa de 2 linhas desta pessoa", async () => {
    const owner = await newMember("CLIENT_OWNER", "dono-grava");
    const rec = (n: number) => call(owner.cookie, "POST", `/api/portal/scripts/${x.a.scriptSent}/recordings`, { url: `https://drive.google.com/file/d/abertura-${n}` });
    expect((await rec(1)).status).toBe(201);
    expect((await rec(2)).status).toBe(201);
    for (let n = 3; n < 8; n++) rateLimited(await rec(n));
    expect(await ownerDb.auditLog.count({ where: { actorId: owner.id, action: "recording.submitted" } })).toBe(2);
    expect(await ownerDb.recording.count({ where: { submittedById: owner.id } })).toBe(2);
  });
});

describe("criacao de conteudo", () => {
  it("o quarto conteudo em 10 min recebe 429; outra pessoa da agencia nao e afetada", async () => {
    const create = (cookie: string, n: number) =>
      call(cookie, "POST", `/api/admin/clients/${x.w.clientA}/contents`, { cycleId: x.a.cycleId, title: `Peca em lote ${n}`, format: "ARTE", plannedOn: "2026-11-28" });
    // o ADMIN deste mundo e compartilhado com outros arquivos de teste: usa um ADMIN novo
    const admin = await makeUser("ADMIN", "admin-lote");
    const cookie = await login(admin.email);
    for (let n = 1; n <= 3; n++) expect((await create(cookie, n)).status, `peca ${n}`).toBe(201);
    rateLimited(await create(cookie, 4));
    expect(await ownerDb.content.count({ where: { clientId: x.w.clientA, title: { startsWith: "Peca em lote" } } })).toBe(3);
    const other = await makeUser("ADMIN", "admin-livre");
    expect((await create(await login(other.email), 5)).status).toBe(201);
  });
});

describe("PUT dos bytes", () => {
  it("o terceiro PUT em 10 min recebe 429 (o arquivo continua PENDENTE); outra pessoa envia normalmente", async () => {
    const owner = await newMember("CLIENT_OWNER", "dono-envia");
    const other = await newMember("CLIENT_OWNER", "dono-envia-2");
    const data = png(300);
    const init = async (cookie: string, name: string) => {
      const r = await call(cookie, "POST", "/api/portal/assets", { originalName: name, mimeType: "image/png", bytes: data.length });
      expect(r.status).toBe(201);
      return r.json as { assetId: string; path: string };
    };
    const put = (cookie: string, path: string) => http(path, { method: "PUT", cookie, rawBody: data, contentType: "application/octet-stream", base: BASE_MUT });
    const t1 = await init(owner.cookie, "a.png");
    const t2 = await init(owner.cookie, "b.png");
    const t3 = await init(owner.cookie, "c.png");
    expect((await put(owner.cookie, t1.path)).status).toBe(201);
    expect((await put(owner.cookie, t2.path)).status).toBe(201);
    rateLimited(await put(owner.cookie, t3.path));
    expect((await ownerDb.asset.findUniqueOrThrow({ where: { id: t3.assetId } })).status).toBe("PENDENTE");
    // outra pessoa
    const o1 = await init(other.cookie, "d.png");
    expect((await put(other.cookie, o1.path)).status).toBe(201);
  });
});
