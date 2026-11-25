import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { sys } from "../integration/helpers/phase2";
import { BASE_MUT, BASE_NO_UPLOADS, err, expectNoLeak, http, login } from "./helpers/http";
import { addMember, makePhase2World, makeUser, ownerDb, type Phase2World } from "./helpers/phase2";

// D-0025 / R-23 por HTTP real: IDOR em todas as rotas novas por cinco tipos de pessoa, origem (CSRF), validacao do
// endereco, limite por pessoa, visibilidade ao cliente e a chave UPLOADS_ENABLED=false (sem rota de arquivo).

let x: Phase2World;
let linkOfB: string;
let draftLinkOfA: string;
let sharedWithLink: { contentId: string; versionId: string; linkId: string };
const SECRET_LABEL = `ROTULO-INTERNO-${randomUUID().slice(0, 6)}`;
const url = (p = randomUUID()) => `https://drive.google.com/file/d/${p}/view`;

beforeAll(async () => {
  x = await makePhase2World();
  linkOfB = (await sys((tx) => tx.mediaLink.create({ data: { clientId: x.w.clientB, scriptId: x.b.scriptSent, label: "do-b", url: url(), host: "drive.google.com", kind: "VIDEO", createdById: x.w.admin.id } }))).id;
  draftLinkOfA = (await sys((tx) => tx.mediaLink.create({ data: { clientId: x.w.clientA, versionId: x.a.versionDraft, label: SECRET_LABEL, url: url(), host: "drive.google.com", kind: "IMAGEM", createdById: x.w.admin.id } }))).id;
  sharedWithLink = await sys(async (tx) => {
    const content = await tx.content.create({ data: { clientId: x.w.clientA, cycleId: x.a.cycleId, title: "Peca com link", format: "ARTE", plannedOn: new Date("2026-11-27T00:00:00Z"), visibility: "COMPARTILHADO" } });
    const version = await tx.contentVersion.create({ data: { clientId: x.w.clientA, contentId: content.id, number: 1, status: "RASCUNHO", caption: "legenda", authorId: x.w.admin.id } });
    const link = await tx.mediaLink.create({ data: { clientId: x.w.clientA, versionId: version.id, label: "Previa publica", url: url(), host: "drive.google.com", kind: "IMAGEM", createdById: x.w.admin.id } });
    await tx.contentVersion.update({ where: { id: version.id }, data: { status: "ENVIADA", sentAt: new Date() } });
    await tx.content.update({ where: { id: content.id }, data: { currentVersionId: version.id, status: "AGUARDANDO_APROVACAO" } });
    return { contentId: content.id, versionId: version.id, linkId: link.id };
  });
});

const adminBase = (c: string) => `/api/admin/clients/${c}/media-links`;
const body = (extra: Record<string, unknown> = {}) => ({ label: "Arte", url: url(), kind: "IMAGEM", ...extra });
const countFor = (clientId: string) => ownerDb.mediaLink.count({ where: { clientId } });

describe("sem sessao: 401 em todas as rotas novas", () => {
  it("admin e portal, listagem, cadastro e remocao", async () => {
    const routes: [string, string, unknown?][] = [
      ["GET", adminBase(x.w.clientA)],
      ["POST", adminBase(x.w.clientA), body({ scriptId: x.a.scriptDraft })],
      ["DELETE", `${adminBase(x.w.clientA)}/${draftLinkOfA}`],
      ["GET", "/api/portal/media-links"],
      ["POST", "/api/portal/media-links", body({ recordingId: x.a.recording })],
      ["DELETE", `/api/portal/media-links/${linkOfB}`],
    ];
    for (const [m, p, b] of routes) {
      const res = await http(p, { method: m, body: b });
      expect(res.status, `${m} ${p}`).toBe(401);
      expectNoLeak(res);
    }
  });
});

describe("IDOR: cinco tipos de pessoa", () => {
  it("pessoa de cliente nas rotas /api/admin: 403 (dono A, colaborador A e dono B), com id do A e do B, e nada muda", async () => {
    const before = [await countFor(x.w.clientA), await countFor(x.w.clientB)];
    for (const who of ["ownerA", "collabA", "ownerB"] as const) {
      for (const client of [x.w.clientA, x.w.clientB]) {
        for (const [m, p, b] of [
          ["GET", adminBase(client), undefined],
          ["POST", adminBase(client), body({ versionId: x.a.versionDraft })],
          ["POST", adminBase(client), body({ scriptId: x.b.scriptSent })],
          ["DELETE", `${adminBase(client)}/${draftLinkOfA}`, undefined],
          ["DELETE", `${adminBase(client)}/${linkOfB}`, undefined],
        ] as const) {
          const res = await http(p, { method: m, cookie: x.cookie[who], body: b });
          expect(res.status, `${who} ${m} ${p}`).toBe(403);
          expect(err(res)?.code).toBe("FORBIDDEN");
          expectNoLeak(res);
        }
      }
    }
    expect([await countFor(x.w.clientA), await countFor(x.w.clientB)]).toEqual(before);
  });

  it("STAFF nao atribuida ao cliente: 404 uniforme (nao revela que o cliente existe)", async () => {
    for (const client of [x.w.clientA, x.w.clientB]) {
      for (const [m, p, b] of [
        ["GET", adminBase(client), undefined],
        ["POST", adminBase(client), body({ scriptId: x.a.scriptDraft })],
        ["DELETE", `${adminBase(client)}/${draftLinkOfA}`, undefined],
      ] as const) {
        const res = await http(p, { method: m, cookie: x.cookie.staffFree, body: b });
        expect(res.status, `${m} ${p}`).toBe(404);
        expectNoLeak(res);
      }
    }
    expect(await ownerDb.mediaLink.count({ where: { id: draftLinkOfA } })).toBe(1);
  });

  it("pessoa do Cliente A na porta do portal com ids do B: 404, sem vazar e sem mudar nada do B", async () => {
    const beforeB = await countFor(x.w.clientB);
    for (const who of ["ownerA", "collabApprover", "collabA"] as const) {
      const del = await http(`/api/portal/media-links/${linkOfB}`, { method: "DELETE", cookie: x.cookie[who] });
      expect(del.status, `${who} delete`).toBe(404);
      const post = await http("/api/portal/media-links", { method: "POST", cookie: x.cookie[who], body: body({ recordingId: x.b.recording }) });
      expect(post.status, `${who} post`).toBe(404);
      for (const q of ["", `?scriptId=${x.b.scriptSent}`, `?clientId=${x.w.clientB}`, `?recordingId=${x.b.recording}`]) {
        const list = await http(`/api/portal/media-links${q}`, { cookie: x.cookie[who] });
        expect(list.status).toBe(200);
        expect(list.text).not.toContain(linkOfB);
        expect(list.text).not.toContain("do-b");
        expect(list.text).not.toContain(x.w.clientB);
      }
    }
    expect(await countFor(x.w.clientB)).toBe(beforeB);
    expect(await ownerDb.mediaLink.count({ where: { id: linkOfB } })).toBe(1);
  });

  it("agencia (ADMIN) apontando o cliente A com ids do B: 404 (o cliente da URL e o alvo; o id tem de ser dele)", async () => {
    const before = await countFor(x.w.clientB);
    const post = await http(adminBase(x.w.clientA), { method: "POST", cookie: x.cookie.admin, body: body({ versionId: x.b.versionDraft }) });
    expect(post.status).toBe(404);
    expect((await http(adminBase(x.w.clientA), { method: "POST", cookie: x.cookie.admin, body: body({ scriptId: x.b.scriptSent }) })).status).toBe(404);
    expect((await http(adminBase(x.w.clientA), { method: "POST", cookie: x.cookie.admin, body: body({ recordingId: x.b.recording }) })).status).toBe(404);
    expect((await http(`${adminBase(x.w.clientA)}/${linkOfB}`, { method: "DELETE", cookie: x.cookie.admin })).status).toBe(404);
    const list = await http(`${adminBase(x.w.clientA)}?scriptId=${x.b.scriptSent}`, { cookie: x.cookie.admin });
    expect((list.json as { items: unknown[] }).items).toEqual([]);
    expect(await countFor(x.w.clientB)).toBe(before);
  });

  it("id malformado e inexistente respondem o mesmo 404", async () => {
    for (const bad of ["nao-e-uuid", randomUUID(), "%00", "..%2f..%2fetc"]) {
      for (const [p, cookie] of [
        [`${adminBase(x.w.clientA)}/${bad}`, x.cookie.admin],
        [`/api/portal/media-links/${bad}`, x.cookie.ownerA],
      ] as const) {
        const res = await http(p, { method: "DELETE", cookie });
        expect(res.status, p).toBe(404);
        expectNoLeak(res);
      }
    }
    for (const bad of ["nao-e-uuid", "1"]) {
      const res = await http(`${adminBase(x.w.clientA)}?scriptId=${bad}`, { cookie: x.cookie.admin });
      expect(res.status).toBe(422);
    }
  });
});

describe("cadastro pela agencia e leitura pelas duas portas", () => {
  it("ADMIN e STAFF atribuida cadastram; a resposta normaliza o endereco e o rotulo; a agencia le createdById, o portal nao", async () => {
    const res = await http(adminBase(x.w.clientA), { method: "POST", cookie: x.cookie.admin, body: body({ scriptId: x.a.scriptDraft, url: "HTTPS://YouTu.be/AbC?t=1#", label: "  Video de apoio  ", kind: "VIDEO" }) });
    expect(res.status).toBe(201);
    const row = res.json as { id: string; url: string; host: string; label: string; createdById: string };
    expect(row).toMatchObject({ url: "https://youtu.be/AbC?t=1", host: "youtu.be", label: "Video de apoio", createdById: x.w.admin.id });
    const staff = await http(adminBase(x.w.clientA), { method: "POST", cookie: x.cookie.staffA, body: body({ scriptId: x.a.scriptDraft }) });
    expect(staff.status).toBe(201);
    const audit = await ownerDb.auditLog.findFirstOrThrow({ where: { action: "media_link.created", entityId: row.id } });
    expect(JSON.stringify(audit.diff)).not.toContain("AbC");
    expect(audit.diff).toMatchObject({ host: "youtu.be", kind: "VIDEO", target: "script" });
  });

  it("o cliente ve o link da versao enviada de conteudo compartilhado (sem createdById) e NAO ve o do rascunho interno", async () => {
    const detail = await http(`/api/portal/contents/${sharedWithLink.contentId}`, { cookie: x.cookie.ownerA });
    expect(detail.status).toBe(200);
    const links = (detail.json as { mediaLinks: Record<string, unknown>[] }).mediaLinks;
    expect(links.map((l) => l.id)).toEqual([sharedWithLink.linkId]);
    expect(Object.keys(links[0]).sort()).toEqual(["createdAt", "host", "id", "kind", "label", "recordingId", "scriptId", "url", "versionId"]);
    expect(detail.text).not.toContain(x.w.admin.id);
    // rascunho interno: a peca nem aparece; e o link nunca vaza por outra rota do portal
    for (const p of ["/api/portal/media-links", `/api/portal/contents/${x.a.contentInternal}`, `/api/portal/media-links?versionId=${x.a.versionDraft}`, "/api/portal/contents"]) {
      const res = await http(p, { cookie: x.cookie.ownerA });
      expect(res.text, p).not.toContain(SECRET_LABEL);
      expect(res.text, p).not.toContain(draftLinkOfA);
    }
    // a agencia ve o do rascunho
    const adminList = await http(`${adminBase(x.w.clientA)}?versionId=${x.a.versionDraft}`, { cookie: x.cookie.admin });
    expect(JSON.stringify(adminList.json)).toContain(SECRET_LABEL);
    expect(JSON.stringify(adminList.json)).toContain(x.w.admin.id);
  });

  it("roteiro em RASCUNHO nao mostra o link ao cliente; ENVIADO em diante mostra", async () => {
    const draft = await sys((tx) => tx.mediaLink.create({ data: { clientId: x.w.clientA, scriptId: x.a.scriptDraft, label: "DO-ROTEIRO-RASCUNHO", url: url(), host: "drive.google.com", kind: "PDF", createdById: x.w.admin.id } }));
    const sent = await sys((tx) => tx.mediaLink.create({ data: { clientId: x.w.clientA, scriptId: x.a.scriptSent, label: "DO-ROTEIRO-ENVIADO", url: url(), host: "drive.google.com", kind: "PDF", createdById: x.w.admin.id } }));
    const list = await http("/api/portal/media-links", { cookie: x.cookie.collabA });
    expect(list.text).not.toContain(draft.id);
    expect(list.text).toContain(sent.id);
    const detail = await http(`/api/portal/scripts/${x.a.scriptSent}`, { cookie: x.cookie.collabA });
    expect(detail.text).toContain("DO-ROTEIRO-ENVIADO");
    expect((await http(`/api/portal/scripts/${x.a.scriptDraft}`, { cookie: x.cookie.collabA })).status).toBe(404);
  });

  it("versao ENVIADA nao aceita link novo nem remocao (409 com a regra do banco)", async () => {
    const add = await http(adminBase(x.w.clientA), { method: "POST", cookie: x.cookie.admin, body: body({ versionId: sharedWithLink.versionId }) });
    expect(add.status).toBe(409);
    expect(err(add)?.code).toBe("RULE_VIOLATION");
    const del = await http(`${adminBase(x.w.clientA)}/${sharedWithLink.linkId}`, { method: "DELETE", cookie: x.cookie.admin });
    expect(del.status).toBe(409);
    expect(await ownerDb.mediaLink.count({ where: { id: sharedWithLink.linkId } })).toBe(1);
  });
});

describe("validacao do endereco e do corpo", () => {
  const bad = ["http://drive.google.com/x", "javascript:alert(1)", "data:text/html,<b>x</b>", "https://evil-drive.google.com.attacker.com/x", "https://notdrive.google.com/x", "https://user:pw@drive.google.com/x", "https://drive.google.com:8443/x", "https://127.0.0.1/x", "https://localhost/x", "https://xn--drve-google-9db.com/x", "https://drive.google.com\\@evil.com/x", "https://drive.google.com/a b", `https://drive.google.com/${"a".repeat(2049)}`];
  it.each(bad.map((u) => [u.slice(0, 60)] as const))("recusa %s com 422 em fields.url e nada e gravado", async (short) => {
    const u = bad.find((b) => b.startsWith(short))!;
    const before = await countFor(x.w.clientA);
    const res = await http(adminBase(x.w.clientA), { method: "POST", cookie: x.cookie.admin, body: body({ scriptId: x.a.scriptDraft, url: u }) });
    expect(res.status).toBe(422);
    expect(Object.keys(err(res)?.fields ?? {})).toEqual(["url"]);
    expect(await countFor(x.w.clientA)).toBe(before);
  });

  it("campos desconhecidos (clientId, createdById, host), tipo invalido, rotulo vazio, destino ausente ou duplo: 422", async () => {
    const post = (b: unknown) => http(adminBase(x.w.clientA), { method: "POST", cookie: x.cookie.admin, body: b });
    for (const extra of [{ clientId: x.w.clientB }, { createdById: x.w.ownerA.id }, { host: "drive.google.com" }, { createdAt: "2020-01-01T00:00:00Z" }]) {
      expect((await post(body({ scriptId: x.a.scriptDraft, ...extra }))).status, JSON.stringify(extra)).toBe(422);
    }
    expect((await post(body({ scriptId: x.a.scriptDraft, kind: "EXECUTAVEL" }))).status).toBe(422);
    expect((await post(body({ scriptId: x.a.scriptDraft, label: "   " }))).status).toBe(422);
    expect((await post(body())).status).toBe(422);
    expect((await post(body({ scriptId: x.a.scriptDraft, versionId: x.a.versionDraft }))).status).toBe(422);
    const portal = await http("/api/portal/media-links", { method: "POST", cookie: x.cookie.ownerA, body: body({ versionId: x.a.versionDraft }) });
    expect(portal.status).toBe(422);
  });

  it("corpo que nao e JSON: 400; mesmo link duas vezes no mesmo destino: 409", async () => {
    const res = await http(adminBase(x.w.clientA), { method: "POST", cookie: x.cookie.admin, rawBody: "label=x", contentType: "application/x-www-form-urlencoded" });
    expect(res.status).toBe(400);
    const u = url();
    expect((await http(adminBase(x.w.clientA), { method: "POST", cookie: x.cookie.admin, body: body({ scriptId: x.a.scriptSent, url: u }) })).status).toBe(201);
    const dup = await http(adminBase(x.w.clientA), { method: "POST", cookie: x.cookie.admin, body: body({ scriptId: x.a.scriptSent, url: u }) });
    expect(dup.status).toBe(409);
    expect(err(dup)?.code).toBe("MEDIA_LINK_DUPLICATE");
  });
});

describe("origem (CSRF)", () => {
  it("POST e DELETE de outra origem ou sem Origin (e sem Sec-Fetch-Site) sao recusados e nada muda", async () => {
    const before = await countFor(x.w.clientA);
    for (const origin of ["https://evil.example", null] as const) {
      const post = await http(adminBase(x.w.clientA), { method: "POST", cookie: x.cookie.admin, origin, body: body({ scriptId: x.a.scriptDraft }) });
      expect(post.status, String(origin)).toBe(403);
      const del = await http(`${adminBase(x.w.clientA)}/${draftLinkOfA}`, { method: "DELETE", cookie: x.cookie.admin, origin });
      expect(del.status, String(origin)).toBe(403);
      const portal = await http("/api/portal/media-links", { method: "POST", cookie: x.cookie.ownerA, origin, body: body({ recordingId: x.a.recording }) });
      expect(portal.status, String(origin)).toBe(403);
    }
    expect(await countFor(x.w.clientA)).toBe(before);
    expect(await ownerDb.mediaLink.count({ where: { id: draftLinkOfA } })).toBe(1);
  });
});

describe("pessoa do cliente: so na gravacao dela", () => {
  it("o dono cadastra e remove na propria gravacao; na de outra pessoa e 403; o colaborador nao remove o do dono", async () => {
    const created = await http("/api/portal/media-links", { method: "POST", cookie: x.cookie.ownerA, body: body({ recordingId: x.a.recording, kind: "VIDEO", label: "Bastidores" }) });
    expect(created.status).toBe(201);
    const id = (created.json as { id: string }).id;
    expect(Object.keys(created.json as object)).not.toContain("createdById");
    const others = await sys((tx) => tx.recording.create({ data: { clientId: x.w.clientA, scriptId: x.a.scriptSent, kind: "LINK", externalUrl: "https://drive.google.com/file/d/de-outra-pessoa", submittedById: x.w.admin.id } }));
    const foreign = await http("/api/portal/media-links", { method: "POST", cookie: x.cookie.ownerA, body: body({ recordingId: others.id }) });
    expect([403, 404]).toContain(foreign.status);
    expect(await ownerDb.mediaLink.count({ where: { recordingId: others.id } })).toBe(0);
    expect((await http(`/api/portal/media-links/${id}`, { method: "DELETE", cookie: x.cookie.collabA })).status).toBe(404);
    expect((await http(`/api/portal/media-links/${id}`, { method: "DELETE", cookie: x.cookie.ownerA })).status).toBe(200);
    expect(await ownerDb.mediaLink.count({ where: { id } })).toBe(0);
    // link cadastrado pela agencia na mesma gravacao: o cliente nao o remove
    const byAgency = await sys((tx) => tx.mediaLink.create({ data: { clientId: x.w.clientA, recordingId: x.a.recording, label: "da agencia", url: url(), host: "drive.google.com", kind: "VIDEO", createdById: x.w.admin.id } }));
    expect((await http(`/api/portal/media-links/${byAgency.id}`, { method: "DELETE", cookie: x.cookie.ownerA })).status).toBe(404);
    expect((await http(`${adminBase(x.w.clientA)}/${byAgency.id}`, { method: "DELETE", cookie: x.cookie.admin })).status).toBe(200);
  });
});

describe("limite por pessoa (instancia com 3 por 10 minutos)", () => {
  it("o 4o cadastro da mesma pessoa recebe 429 com Retry-After e nada e gravado; outra pessoa tem balde proprio", async () => {
    const u1 = await makeUser("USER", "dono-links");
    await addMember(x.w.clientA, u1.id, "CLIENT_OWNER");
    const c1 = await login(u1.email);
    const rec = await sys((tx) => tx.recording.create({ data: { clientId: x.w.clientA, scriptId: x.a.scriptSent, kind: "LINK", externalUrl: "https://drive.google.com/file/d/limite", submittedById: u1.id } }));
    const post = (cookie: string, recordingId: string) => http("/api/portal/media-links", { method: "POST", cookie, base: BASE_MUT, body: body({ recordingId }) });
    for (let i = 0; i < 3; i++) expect((await post(c1, rec.id)).status).toBe(201);
    const blocked = await post(c1, rec.id);
    expect(blocked.status).toBe(429);
    expect(err(blocked)?.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await ownerDb.mediaLink.count({ where: { recordingId: rec.id } })).toBe(3);
    // remover tambem gasta o limite da pessoa
    const mine = await ownerDb.mediaLink.findFirstOrThrow({ where: { recordingId: rec.id } });
    expect((await http(`/api/portal/media-links/${mine.id}`, { method: "DELETE", cookie: c1, base: BASE_MUT })).status).toBe(429);
    // outra pessoa tem balde proprio (o limite e por pessoa, nunca global)
    const u2 = await makeUser("USER", "dono-links-2");
    await addMember(x.w.clientA, u2.id, "CLIENT_OWNER");
    const rec2 = await sys((tx) => tx.recording.create({ data: { clientId: x.w.clientA, scriptId: x.a.scriptSent, kind: "LINK", externalUrl: "https://drive.google.com/file/d/limite-2", submittedById: u2.id } }));
    expect((await post(await login(u2.email), rec2.id)).status).toBe(201);
  });
});

describe("UPLOADS_ENABLED=false (padrao do app real): nao existe pedido, envio nem download de arquivo", () => {
  const routes: [string, string, unknown?][] = [
    ["POST", `/api/admin/clients/CID/assets`, { originalName: "a.png", mimeType: "image/png", bytes: 100 }],
    ["POST", "/api/portal/assets", { originalName: "a.png", mimeType: "image/png", bytes: 100 }],
    ["POST", `/api/admin/clients/CID/assets/AID/download`],
    ["POST", "/api/portal/assets/AID/download"],
    ["PUT", "/api/files/upload/token.invalido"],
    ["GET", "/api/files/download/token.invalido"],
  ];
  const fill = (p: string) => p.replace("CID", x.w.clientA).replace("AID", x.a.assetAvailable);

  it("404 NOT_FOUND com a forma padrao de erro, para quem esta logado (e nas rotas de bytes, ate sem login)", async () => {
    for (const [m, p, b] of routes) {
      for (const cookie of [undefined, x.cookie.admin, x.cookie.ownerA]) {
        const res = await http(fill(p), { method: m, cookie, body: b, base: BASE_NO_UPLOADS });
        // Sem cookie, o proxy de sessao responde 401 antes de qualquer rota /api/admin ou /api/portal (igual a todas as
        // outras); as rotas de bytes ficam fora dele e respondem 404 mesmo sem login.
        if (!cookie && !p.startsWith("/api/files")) {
          expect(res.status, `${m} ${p} anonimo`).toBe(401);
          continue;
        }
        expect(res.status, `${m} ${p} ${cookie ? "logado" : "anonimo"}`).toBe(404);
        expect(err(res)?.code).toBe("NOT_FOUND");
        expect(Object.keys((res.json as { error: object }).error).sort()).toEqual(["code", "message", "requestId"]);
        expectNoLeak(res);
      }
    }
    expect(await ownerDb.asset.count({ where: { clientId: x.w.clientA, originalName: "a.png" } })).toBe(0);
  });

  it("gravacao por arquivo (assetId) tambem e 404; por link continua funcionando", async () => {
    const withAsset = await http(`/api/portal/scripts/${x.a.scriptSent}/recordings`, { method: "POST", cookie: x.cookie.collabA, base: BASE_NO_UPLOADS, body: { assetId: x.a.assetAvailable, imageRightsConfirmed: true } });
    expect(withAsset.status).toBe(404);
    expect(err(withAsset)?.code).toBe("NOT_FOUND");
  });

  it("as telas nao oferecem envio de arquivo (nem upload, nem seletor de video) e mostram os links de midia", async () => {
    const off = BASE_NO_UPLOADS;
    const adminContent = await http(`/admin/contents/${x.a.contentInternal}?client=${x.w.clientA}`, { cookie: x.cookie.admin, base: off });
    const adminScript = await http(`/admin/scripts/${x.a.scriptSent}?client=${x.w.clientA}`, { cookie: x.cookie.admin, base: off });
    const portalScript = await http(`/portal/scripts/${x.a.scriptSent}`, { cookie: x.cookie.ownerA, base: off });
    for (const [name, res] of [["admin conteudo", adminContent], ["admin roteiro", adminScript], ["portal roteiro", portalScript]] as const) {
      expect(res.status, name).toBe(200);
      expect(res.text, name).not.toMatch(/Enviar e anexar|Enviar vídeo|Arquivo de vídeo da gravação|data-testid="file-uploader"/);
    }
    expect(adminContent.text).toContain("Links de mídia");
    expect(adminScript.text).toContain("Links de mídia do roteiro");
    // com a chave ligada o seletor de arquivo da gravacao existe
    const on = await http(`/portal/scripts/${x.a.scriptSent}`, { cookie: x.cookie.ownerA });
    expect(on.text).toContain("Arquivo de vídeo da gravação");
  });

  it("com a chave ligada (instancia padrao dos testes) as mesmas rotas existem; os links de midia funcionam nas duas", async () => {
    const init = await http("/api/portal/assets", { method: "POST", cookie: x.cookie.ownerA, body: { originalName: "ligado.png", mimeType: "image/png", bytes: 100 } });
    expect(init.status).toBe(201);
    const tokenless = await http("/api/files/download/token.invalido", { cookie: x.cookie.ownerA });
    expect(tokenless.status).toBe(404); // token invalido, mas por regra do token, nao por rota ausente
    const link = await http(adminBase(x.w.clientA), { method: "POST", cookie: x.cookie.admin, base: BASE_NO_UPLOADS, body: body({ scriptId: x.a.scriptDraft }) });
    expect(link.status).toBe(201);
    const list = await http("/api/portal/assets", { cookie: x.cookie.ownerA, base: BASE_NO_UPLOADS });
    expect(list.status).toBe(200);
  });
});
