import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { BASE, BASE_LOW, err, expectNoLeak, http, login } from "./helpers/http";
import {
  STORAGE_DIR,
  api,
  addMember,
  forgeToken,
  interruptedPut,
  jpeg,
  listStoredKeys,
  makePhase2World,
  makeUser,
  mp4,
  nowSeconds,
  ownerDb,
  pdf,
  png,
  storedBytes,
  uploadVia,
  type Phase2World,
} from "./helpers/phase2";

// R-5 por HTTP real: upload em streaming, tipo real, limites, download so como anexo por link assinado curto,
// link vencido/adulterado/de outra pessoa/de outro cliente, limite de tentativas, CSRF e corpo gigante.

let x: Phase2World;
const PORTAL = "/api/portal/assets";
const ADMIN = () => `/api/admin/clients/${x.w.clientA}/assets`;
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

async function rawGet(p: string, cookie: string, base = BASE) {
  const res = await fetch(base + p, { headers: { cookie, "x-real-ip": "10.77.1.1" }, redirect: "manual" });
  return { status: res.status, headers: res.headers, bytes: Buffer.from(await res.arrayBuffer()) };
}
const asset = (id: string) => ownerDb.asset.findUniqueOrThrow({ where: { id } });
async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}
async function freshUser(label: string) {
  const u = await makeUser("USER", label);
  await addMember(x.w.clientA, u.id, "CLIENT_COLLABORATOR");
  return { ...u, cookie: await login(u.email) };
}

beforeAll(async () => {
  x = await makePhase2World();
});

describe("envio e download de ponta a ponta", () => {
  it("imagem, PDF e video (12 MB, acima do buffer de 10 MB do proxy do Next) sobem em streaming, finalizam e baixam identicos", async () => {
    const publicBefore = await walk(path.resolve(__dirname, "../../public"));
    const cases = [
      { name: "arte.png", mime: "image/png", data: png(300_000), cat: "IMAGEM" },
      { name: "carrossel.jpeg", mime: "image/jpeg", data: jpeg(50_000), cat: "IMAGEM" },
      { name: "Roteiro Março.pdf", mime: "application/pdf", data: pdf(900_000), cat: "DOCUMENTO" },
      { name: "gravacao.mp4", mime: "video/mp4", data: mp4(12 * 1024 * 1024), cat: "VIDEO" },
    ];
    for (const c of cases) {
      const up = await uploadVia(x.cookie.ownerA, PORTAL, { originalName: c.name, mimeType: c.mime, bytes: c.data.length }, c.data);
      expect(up.init.status, c.name).toBe(201);
      expect(up.put?.status, `${c.name} ${up.put?.text}`).toBe(201);
      const row = await asset(up.assetId!);
      expect(row).toMatchObject({ status: "DISPONIVEL", mimeType: c.mime, category: c.cat, bytes: BigInt(c.data.length), checksumSha256: sha(c.data), uploadedById: x.w.ownerA.id, clientId: x.w.clientA });
      expect(row.storageKey).toMatch(new RegExp(`^clients/${x.w.clientA}/[0-9a-f-]{36}$`));
      expect((await storedBytes(row.storageKey))?.equals(c.data)).toBe(true);

      const link = await api(x.cookie.ownerA).post(`${PORTAL}/${up.assetId}/download`);
      expect(link.status).toBe(200);
      const lp = (link.json as { path: string; expiresAt: string }).path;
      expect(new Date((link.json as { expiresAt: string }).expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(61_000);
      const got = await rawGet(lp, x.cookie.ownerA);
      expect(got.status, c.name).toBe(200);
      expect(got.bytes.equals(c.data)).toBe(true);
      // sempre como anexo, tipo validado, nosniff, sem cache
      expect(got.headers.get("content-disposition")).toMatch(/^attachment; filename="/);
      expect(got.headers.get("content-disposition")).not.toMatch(/inline/i);
      expect(got.headers.get("content-type")).toBe(c.mime);
      expect(got.headers.get("x-content-type-options")).toBe("nosniff");
      expect(got.headers.get("cache-control")).toContain("no-store");
    }
    // nenhum arquivo foi parar na pasta publica do app
    expect(await walk(path.resolve(__dirname, "../../public"))).toEqual(publicBefore);
    expect(STORAGE_DIR.includes(`${path.sep}public${path.sep}`)).toBe(false);
  }, 60_000);

  it("nao existe URL permanente: o caminho da chave de armazenamento e do nome do arquivo nao servem nada", async () => {
    const keys = await listStoredKeys();
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys.slice(0, 3)) {
      for (const p of [`/${k}`, `/files/${k}`, `/uploads/${k}`, `/api/files/${k}`, `/api/files/download/${k.split("/")[2]}`]) {
        const r = await http(p, { cookie: x.cookie.ownerA });
        expect([401, 404], p).toContain(r.status);
        expect(r.text).not.toContain("PNG");
      }
    }
  });

  it("nome com aspas, quebra de linha e inversao de texto nao injeta cabecalho nem muda o tipo", async () => {
    const data = png(2000);
    // ".html" no meio do nome ja e recusado (dupla extensao perigosa)
    expect((await api(x.cookie.ownerA).post(PORTAL, { originalName: 'lindo"; filename=x.html.png', mimeType: "image/png", bytes: data.length })).status).toBe(422);
    const up = await uploadVia(x.cookie.ownerA, PORTAL, { originalName: 'lindo"; filename=x.png', mimeType: "image/png", bytes: data.length }, data);
    expect(up.put?.status).toBe(201);
    const link = (await api(x.cookie.ownerA).post(`${PORTAL}/${up.assetId}/download`)).json as { path: string };
    const got = await rawGet(link.path, x.cookie.ownerA);
    const cd = got.headers.get("content-disposition")!;
    expect(cd.startsWith("attachment; ")).toBe(true);
    expect(cd.split("\n")).toHaveLength(1);
    expect(got.headers.get("content-type")).toBe("image/png");
    // nome com controle e inversao e recusado no pedido
    for (const originalName of ["a\r\nSet-Cookie: x=1.png", "a‮gnp.exe.png"]) {
      const r = await api(x.cookie.ownerA).post(PORTAL, { originalName, mimeType: "image/png", bytes: 10 });
      expect(r.status, JSON.stringify(originalName)).toBe(422);
    }
  });

  it("querystring nao troca o modo de entrega (inline, tipo ou nome): continua anexo", async () => {
    const data = png(1500);
    const up = await uploadVia(x.cookie.ownerA, PORTAL, { originalName: "q.png", mimeType: "image/png", bytes: data.length }, data);
    const link = (await api(x.cookie.ownerA).post(`${PORTAL}/${up.assetId}/download`)).json as { path: string };
    const got = await rawGet(`${link.path}?inline=1&response-content-disposition=inline&type=text/html&filename=x.html`, x.cookie.ownerA);
    expect(got.status).toBe(200);
    expect(got.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(got.headers.get("content-type")).toBe("image/png");
  });
});

describe("arquivo malicioso e tipos recusados", () => {
  const initRefused: [string, string, string][] = [
    ["extensao dupla .jpg.exe", "foto.jpg.exe", "image/jpeg"],
    ["extensao dupla .png.html", "foto.png.html", "image/png"],
    ["EXE em maiusculas", "SETUP.EXE", "image/png"],
    ["SVG por tipo declarado", "logo.svg", "image/svg+xml"],
    ["HTML por tipo declarado", "pagina.png", "text/html"],
    ["XML", "dados.xml", "application/xml"],
    ["Office com macro", "planilha.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12"],
    ["script shell", "run.sh", "application/x-sh"],
    ["ZIP", "pacote.zip", "application/zip"],
    ["tipo generico", "arte.png", "application/octet-stream"],
    ["GIF (fora da lista)", "anim.gif", "image/gif"],
  ];

  it("recusado ja no pedido (422), sem criar registro nem objeto", async () => {
    const before = await listStoredKeys();
    const rows = await ownerDb.asset.count({ where: { clientId: x.w.clientA } });
    for (const [label, originalName, mimeType] of initRefused) {
      const r = await api(x.cookie.ownerA).post(PORTAL, { originalName, mimeType, bytes: 1000 });
      expect(r.status, label).toBe(422);
      expectNoLeak(r);
    }
    expect(await ownerDb.asset.count({ where: { clientId: x.w.clientA } })).toBe(rows);
    expect(await listStoredKeys()).toEqual(before);
  });

  it("conteudo que nao e o que o nome e o tipo dizem: 422, objeto apagado, registro REJEITADO e auditado, nunca baixa", async () => {
    const lies: { label: string; meta: { originalName: string; mimeType: string }; data: Buffer; code: string }[] = [
      { label: "executavel disfarcado de imagem", meta: { originalName: "arte.png", mimeType: "image/png" }, data: Buffer.concat([Buffer.from("MZ\x90\x00\x03"), Buffer.alloc(3000, 1)]), code: "TYPE_UNRECOGNIZED" },
      { label: "HTML ativo como jpg", meta: { originalName: "foto.jpg", mimeType: "image/jpeg" }, data: Buffer.from("<html><body><script>fetch('/api/portal/client')</script></body></html>".padEnd(2000, " ")), code: "TYPE_UNRECOGNIZED" },
      { label: "SVG com script como png", meta: { originalName: "logo.png", mimeType: "image/png" }, data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'.padEnd(800, " ")), code: "TYPE_UNRECOGNIZED" },
      { label: "docx/zip como pdf", meta: { originalName: "contrato.pdf", mimeType: "application/pdf" }, data: Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.alloc(900, 2)]), code: "TYPE_UNRECOGNIZED" },
      { label: "MIME mentiroso: PNG declarado jpeg", meta: { originalName: "a.jpg", mimeType: "image/jpeg" }, data: png(4000), code: "TYPE_MISMATCH" },
      { label: "extensao trocada: PDF chamado .png", meta: { originalName: "a.png", mimeType: "application/pdf" }, data: pdf(4000), code: "EXTENSION_MISMATCH" },
      { label: "sem extensao", meta: { originalName: "arte", mimeType: "image/png" }, data: png(4000), code: "EXTENSION_MISMATCH" },
      { label: "HEIC como mp4", meta: { originalName: "v.mp4", mimeType: "video/mp4" }, data: Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(3000)]), code: "TYPE_UNRECOGNIZED" },
    ];
    for (const e of lies) {
      const keysBefore = await listStoredKeys();
      const up = await uploadVia(x.cookie.ownerA, PORTAL, { ...e.meta, bytes: e.data.length }, e.data);
      expect(up.init.status, e.label).toBe(201);
      expect(up.put?.status, `${e.label} ${up.put?.text}`).toBe(422);
      expect(err(up.put!)?.code, e.label).toBe(e.code);
      const row = await asset(up.assetId!);
      expect(row.status, e.label).toBe("REJEITADO");
      expect(await storedBytes(row.storageKey), e.label).toBeNull();
      expect(await listStoredKeys(), e.label).toEqual(keysBefore);
      expect(await ownerDb.auditLog.count({ where: { action: "asset.rejected", entityId: up.assetId } }), e.label).toBe(1);
      expect((await api(x.cookie.ownerA).post(`${PORTAL}/${up.assetId}/download`)).status, e.label).toBe(404);
      // e o mesmo alvo nao aceita um segundo envio
      const again = await http((up.init.json as { path: string }).path, { method: "PUT", cookie: x.cookie.ownerA, rawBody: png(100), contentType: "application/octet-stream" });
      expect([409, 422], e.label).toContain(again.status);
      expect((await asset(up.assetId!)).status, e.label).toBe("REJEITADO");
    }
  });

  it("Content-Type da requisicao de envio nunca decide: so octet-stream (415 nos outros) e nada e gravado", async () => {
    const data = png(2000);
    const init = await api(x.cookie.ownerA).post(PORTAL, { originalName: "ct.png", mimeType: "image/png", bytes: data.length });
    const p = (init.json as { path: string; assetId: string }).path;
    for (const contentType of ["image/png", "text/html", "multipart/form-data; boundary=x", "application/json"]) {
      const r = await http(p, { method: "PUT", cookie: x.cookie.ownerA, rawBody: data, contentType });
      expect(r.status, contentType).toBe(415);
    }
    expect((await asset((init.json as { assetId: string }).assetId)).status).toBe("PENDENTE");
    expect((await http(p, { method: "PUT", cookie: x.cookie.ownerA, rawBody: data, contentType: "application/octet-stream" })).status).toBe(201);
  });
});

describe("tamanho: limite por tipo, streaming e envio interrompido", () => {
  it("acima do limite do tipo: 413 no pedido (imagem 1 MB, PDF 2 MB, video 16 MB neste ambiente de teste)", async () => {
    for (const [mimeType, name, bytes] of [["image/png", "g.png", 1024 * 1024 + 1], ["application/pdf", "g.pdf", 2 * 1024 * 1024 + 1], ["video/mp4", "g.mp4", 16 * 1024 * 1024 + 1]] as const) {
      const r = await api(x.cookie.ownerA).post(PORTAL, { originalName: name, mimeType, bytes });
      expect(r.status, name).toBe(413);
      expect(err(r)?.code).toBe("PAYLOAD_TOO_LARGE");
    }
    expect((await api(x.cookie.ownerA).post(PORTAL, { originalName: "z.png", mimeType: "image/png", bytes: 0 })).status).toBe(422);
    expect((await api(x.cookie.ownerA).post(PORTAL, { originalName: "z.png", mimeType: "image/png", bytes: -5 })).status).toBe(422);
    expect((await api(x.cookie.ownerA).post(PORTAL, { originalName: "z.png", mimeType: "image/png", bytes: 1.5 })).status).toBe(422);
  });

  it("declarou pouco e mandou muito (sem Content-Length, em pedacos): 413 durante a gravacao, REJEITADO, sem objeto", async () => {
    const init = await api(x.cookie.ownerA).post(PORTAL, { originalName: "mente.png", mimeType: "image/png", bytes: 1000 });
    const target = init.json as { path: string; assetId: string };
    const big = png(600_000);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < big.length; i += 50_000) c.enqueue(big.subarray(i, i + 50_000));
        c.close();
      },
    });
    const res = await fetch(BASE + target.path, {
      method: "PUT",
      // connection: close: o servidor encerra a conexao ao recusar sem ler o corpo todo; o cliente nao deve reaproveita-la
      headers: { cookie: x.cookie.ownerA, origin: BASE, "content-type": "application/octet-stream", "x-real-ip": "10.77.2.2", connection: "close" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(res.status).toBe(413);
    const row = await asset(target.assetId);
    expect(row.status).toBe("REJEITADO");
    expect(await storedBytes(row.storageKey)).toBeNull();
  });

  it("menos bytes que o declarado: 422 INCOMPLETE_UPLOAD, segue PENDENTE e o mesmo alvo ainda vale", async () => {
    const data = png(5000);
    const init = await api(x.cookie.ownerA).post(PORTAL, { originalName: "curto.png", mimeType: "image/png", bytes: data.length });
    const target = init.json as { path: string; assetId: string };
    const short = await http(target.path, { method: "PUT", cookie: x.cookie.ownerA, rawBody: data.subarray(0, 2000), contentType: "application/octet-stream" });
    expect(short.status).toBe(422);
    expect(err(short)?.code).toBe("INCOMPLETE_UPLOAD");
    expect((await asset(target.assetId)).status).toBe("PENDENTE");
    const ok = await http(target.path, { method: "PUT", cookie: x.cookie.ownerA, rawBody: data, contentType: "application/octet-stream" });
    expect(ok.status).toBe(201);
  });

  it("conexao que cai no meio: nada fica DISPONIVEL, sem objeto nem temporario; PENDENTE nao aparece para o colega nem baixa", async () => {
    const data = png(900_000);
    const init = await api(x.cookie.ownerA).post(PORTAL, { originalName: "queda.png", mimeType: "image/png", bytes: data.length });
    const target = init.json as { path: string; assetId: string };
    await interruptedPut(x.cookie.ownerA, target.path, data.length, data.subarray(0, 120_000));
    // espera o servidor perceber o aborto e limpar o temporario
    let leftovers: string[] = [];
    for (let i = 0; i < 40; i++) {
      leftovers = await fs.readdir(path.join(STORAGE_DIR, ".tmp")).catch(() => []);
      if (leftovers.length === 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(leftovers).toEqual([]);
    const row = await asset(target.assetId);
    expect(row.status).toBe("PENDENTE");
    expect(await storedBytes(row.storageKey)).toBeNull();
    expect((await api(x.cookie.ownerA).post(`${PORTAL}/${target.assetId}/download`)).status).toBe(404);
    // o colega do mesmo cliente nem enxerga o pendente (nem na lista, nem por id)
    const list = await api(x.cookie.collabA).get(`${PORTAL}?pageSize=50`);
    expect(list.text).not.toContain(target.assetId);
    expect((await api(x.cookie.collabA).get(`${PORTAL}/${target.assetId}`)).status).toBe(404);
    // retomar: enviar de novo no mesmo alvo
    expect((await http(target.path, { method: "PUT", cookie: x.cookie.ownerA, rawBody: data, contentType: "application/octet-stream" })).status).toBe(201);
  });

  it("repetir o envio finalizado devolve o mesmo resultado (200, replayed) sem gravar de novo", async () => {
    const data = png(4000);
    const up = await uploadVia(x.cookie.ownerA, PORTAL, { originalName: "rep.png", mimeType: "image/png", bytes: data.length }, data);
    expect(up.put?.status).toBe(201);
    const again = await http((up.init.json as { path: string }).path, { method: "PUT", cookie: x.cookie.ownerA, rawBody: data, contentType: "application/octet-stream" });
    expect(again.status).toBe(200);
    expect(again.json).toMatchObject({ id: up.assetId, status: "DISPONIVEL", replayed: true, checksumSha256: sha(data) });
    expect(await ownerDb.auditLog.count({ where: { action: "asset.finalized", entityId: up.assetId } })).toBe(1);
  });
});

describe("link assinado: vinculado a pessoa, cliente e arquivo; vence (R-5)", () => {
  let id: string;
  let link: string;
  const data = png(3000);

  beforeAll(async () => {
    const up = await uploadVia(x.cookie.ownerA, PORTAL, { originalName: "assinado.png", mimeType: "image/png", bytes: data.length }, data);
    id = up.assetId!;
    link = ((await api(x.cookie.ownerA).post(`${PORTAL}/${id}/download`)).json as { path: string }).path;
  });

  it("de outra pessoa, de outro cliente, sem sessao, adulterado e de outra finalidade: nada entrega", async () => {
    expect((await rawGet(link, x.cookie.ownerA)).status).toBe(200);
    for (const who of ["collabA", "ownerB", "staffFree", "staffA"] as const) {
      const r = await http(link, { cookie: x.cookie[who] });
      expect(r.status, who).toBe(404);
      expectNoLeak(r);
    }
    expect((await http(link, { cookie: x.cookie.admin })).status).toBe(404); // ate o admin: o link e DE QUEM o pediu
    expect((await http(link)).status).toBe(401);
    const tampered = link.slice(0, -4) + (link.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect((await http(tampered, { cookie: x.cookie.ownerA })).status).toBe(404);
    expect((await http(link.replace("/download/", "/upload/"), { method: "PUT", cookie: x.cookie.ownerA, rawBody: data, contentType: "application/octet-stream" })).status).toBe(404);
    expect((await http("/api/files/download/lixo", { cookie: x.cookie.ownerA })).status).toBe(404);
    expect((await http(`/api/files/download/${"A".repeat(2000)}`, { cookie: x.cookie.ownerA })).status).toBe(404);
  });

  it("assinado de verdade mas para outro cliente/pessoa: o B nao abre o arquivo do A, nem com o id certo", async () => {
    const claims = { purpose: "download" as const, assetId: id, expiresAt: nowSeconds() + 60 };
    const forgedB = forgeToken({ ...claims, clientId: x.w.clientB, userId: x.w.ownerB.id });
    expect((await http(`/api/files/download/${forgedB}`, { cookie: x.cookie.ownerB })).status).toBe(404);
    const mixed = forgeToken({ ...claims, clientId: x.w.clientA, userId: x.w.ownerB.id });
    expect((await http(`/api/files/download/${mixed}`, { cookie: x.cookie.ownerB })).status).toBe(404);
    // token do A emitido para a pessoa do A, usado pela sessao do B
    const own = forgeToken({ ...claims, clientId: x.w.clientA, userId: x.w.ownerA.id });
    expect((await http(`/api/files/download/${own}`, { cookie: x.cookie.ownerB })).status).toBe(404);
    expect((await rawGet(`/api/files/download/${own}`, x.cookie.ownerA)).status).toBe(200);
  });

  it("vencido (assinatura valida, pessoa certa): 410; a mesma coisa para a pessoa errada continua 404", async () => {
    const expired = forgeToken({ purpose: "download", assetId: id, clientId: x.w.clientA, userId: x.w.ownerA.id, expiresAt: nowSeconds() - 1 });
    const r = await http(`/api/files/download/${expired}`, { cookie: x.cookie.ownerA });
    expect(r.status).toBe(410);
    expect(err(r)?.code).toBe("LINK_EXPIRED");
    expect((await http(`/api/files/download/${expired}`, { cookie: x.cookie.collabA })).status).toBe(404);
    const upExpired = forgeToken({ purpose: "upload", assetId: id, clientId: x.w.clientA, userId: x.w.ownerA.id, expiresAt: nowSeconds() - 5 });
    expect((await http(`/api/files/upload/${upExpired}`, { method: "PUT", cookie: x.cookie.ownerA, rawBody: data, contentType: "application/octet-stream" })).status).toBe(410);
  });

  it("expira com o relogio real (link de 5 s): entrega antes, 410 depois", async () => {
    const u = await freshUser("expira"); // pessoa nova: o limite por pessoa e compartilhado entre as instancias (mesmo banco)
    const up = await uploadVia(u.cookie, PORTAL, { originalName: "exp.png", mimeType: "image/png", bytes: data.length }, data);
    const dl = await http(`${PORTAL}/${up.assetId}/download`, { method: "POST", cookie: u.cookie, base: BASE_LOW });
    expect(dl.status).toBe(200);
    const p = (dl.json as { path: string }).path;
    expect((await rawGet(p, u.cookie, BASE_LOW)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 6000));
    const late = await rawGet(p, u.cookie, BASE_LOW);
    expect(late.status).toBe(410);
    expect(late.bytes.toString()).not.toContain("PNG");
  }, 20_000);

  it("perder o acesso mata o link antigo: participacao revogada e arquivo excluido deixam de entregar", async () => {
    const u = await freshUser("perde");
    const up = await uploadVia(u.cookie, PORTAL, { originalName: "perde.png", mimeType: "image/png", bytes: data.length }, data);
    const l1 = ((await api(u.cookie).post(`${PORTAL}/${up.assetId}/download`)).json as { path: string }).path;
    expect((await rawGet(l1, u.cookie)).status).toBe(200);
    const member = await ownerDb.clientMember.findFirstOrThrow({ where: { userId: u.id } });
    await ownerDb.clientMember.update({ where: { id: member.id }, data: { status: "REVOKED" } });
    expect((await http(l1, { cookie: u.cookie })).status).toBe(404);
    expect((await http(`${PORTAL}/${up.assetId}/download`, { method: "POST", cookie: u.cookie })).status).toBeGreaterThanOrEqual(400);
    await ownerDb.clientMember.update({ where: { id: member.id }, data: { status: "ACTIVE" } });
    expect((await rawGet(l1, u.cookie)).status).toBe(200); // voltou: a regra e do momento da entrega
    // exclusao do arquivo: o link ja emitido morre e o objeto sai do disco
    const key = (await asset(up.assetId!)).storageKey;
    expect((await api(u.cookie).del(`${PORTAL}/${up.assetId}`)).status).toBe(200);
    expect((await http(l1, { cookie: u.cookie })).status).toBe(404);
    expect(await storedBytes(key)).toBeNull();
    expect((await asset(up.assetId!)).status).toBe("EXCLUIDO");
    expect(await ownerDb.auditLog.count({ where: { action: "asset.deleted", entityId: up.assetId } })).toBe(1);
  });

  it("so quem enviou (ou ADMIN) exclui: colega e outro cliente recebem 404 e o arquivo continua", async () => {
    expect((await api(x.cookie.collabA).del(`${PORTAL}/${id}`)).status).toBe(404);
    expect((await api(x.cookie.ownerB).del(`${PORTAL}/${id}`)).status).toBe(404);
    expect((await asset(id)).status).toBe("DISPONIVEL");
    expect((await api(x.cookie.admin).del(`${ADMIN()}/${id}`)).status).toBe(200);
    expect((await asset(id)).status).toBe("EXCLUIDO");
  });
});

describe("agencia anexa a versao; cliente so baixa o que ve; versao enviada e imutavel", () => {
  it("fluxo: arquivo INTERNO ligado a versao nao aparece nem baixa para o cliente; compartilhado, sim; vinculo de versao enviada nao sai nem troca", async () => {
    const admin = api(x.cookie.admin);
    const base = `/api/admin/clients/${x.w.clientA}`;
    const created = await admin.post(`${base}/contents`, { cycleId: x.a.cycleId, title: "Peca com arquivo", format: "ARTE", plannedOn: "2026-11-18" });
    expect(created.status).toBe(201);
    const cid = (created.json as { id: string }).id;
    expect((await admin.post(`${base}/contents/${cid}/status`, { to: "EM_PRODUCAO" })).status).toBe(200);
    expect((await admin.put(`${base}/contents/${cid}/material`, { caption: "legenda com arte" })).status).toBe(200);
    const versionId = ((await admin.get(`${base}/contents/${cid}`)).json as { versions: { id: string }[] }).versions[0].id;

    const data = png(8000);
    const up = await uploadVia(x.cookie.admin, ADMIN(), { originalName: "previa.png", mimeType: "image/png", bytes: data.length }, data);
    expect(up.put?.status).toBe(201);
    expect((await asset(up.assetId!)).visibility).toBe("INTERNO"); // padrao da agencia
    const attach = await admin.post(`${ADMIN()}/${up.assetId}/links`, { role: "PREVIA", versionId });
    expect(attach.status).toBe(201);
    const linkId = (attach.json as { id: string }).id;
    expect((await admin.put(`${base}/contents/${cid}/visibility`, { visibility: "COMPARTILHADO" })).status).toBe(200);
    expect((await admin.post(`${base}/contents/${cid}/send`, {})).status).toBe(200);

    const detail1 = await http(`/api/portal/contents/${cid}`, { cookie: x.cookie.ownerA });
    expect(detail1.status).toBe(200);
    expect((detail1.json as { assets: unknown[] }).assets).toHaveLength(0); // INTERNO: escondido
    expect((await api(x.cookie.ownerA).post(`${PORTAL}/${up.assetId}/download`)).status).toBe(404);

    expect((await admin.patch(`${ADMIN()}/${up.assetId}`, { visibility: "COMPARTILHADO" })).status).toBe(200);
    const detail2 = await http(`/api/portal/contents/${cid}`, { cookie: x.cookie.ownerA });
    const assets = (detail2.json as { assets: { asset: Record<string, unknown>; link: { role: string; position: number } }[] }).assets;
    expect(assets).toHaveLength(1);
    expect(assets[0].link.role).toBe("PREVIA");
    expect(Object.keys(assets[0].asset).sort()).toEqual(["bytes", "category", "createdAt", "id", "mimeType", "originalName", "status"].sort());
    expect(detail2.text).not.toContain("storageKey");
    expect(detail2.text).not.toContain("clients/");
    const dl = await api(x.cookie.ownerA).post(`${PORTAL}/${up.assetId}/download`);
    expect(dl.status).toBe(200);
    expect((await rawGet((dl.json as { path: string }).path, x.cookie.ownerA)).bytes.equals(data)).toBe(true);
    // o colega do mesmo cliente tambem ve (esta ligado a destino visivel); o B nao
    expect((await api(x.cookie.collabA).post(`${PORTAL}/${up.assetId}/download`)).status).toBe(200);
    expect((await api(x.cookie.ownerB).post(`${PORTAL}/${up.assetId}/download`)).status).toBe(404);

    // versao ja enviada: nao troca, nao sai, nao recebe vinculo novo, arquivo nao e excluido
    const detach = await admin.del(`${base}/asset-links/${linkId}`);
    expect(detach.status).toBe(409);
    expect(err(detach)?.code).toBe("RULE_VIOLATION");
    expect(detach.text).toContain("nova versao");
    expectNoLeak(detach);
    const del = await admin.del(`${ADMIN()}/${up.assetId}`);
    expect(del.status).toBe(409);
    const data2 = png(3000);
    const up2 = await uploadVia(x.cookie.admin, ADMIN(), { originalName: "outra.png", mimeType: "image/png", bytes: data2.length }, data2);
    expect((await admin.post(`${ADMIN()}/${up2.assetId}/links`, { role: "PREVIA", versionId })).status).toBe(409);
    expect(await ownerDb.assetLink.count({ where: { id: linkId } })).toBe(1);
    expect((await asset(up.assetId!)).status).toBe("DISPONIVEL");
    // a saida e nova versao: editar material copia os vinculos e abre outra versao
    expect((await admin.put(`${base}/contents/${cid}/material`, { caption: "legenda 2" })).status).toBe(200);
    expect(await ownerDb.assetLink.count({ where: { assetId: up.assetId! } })).toBe(2);
  });

  it("cliente nao anexa a versao nem lista arquivo da agencia nem muda visibilidade", async () => {
    expect((await api(x.cookie.ownerA).post(`/api/admin/clients/${x.w.clientA}/assets/${x.a.assetAvailable}/links`, { role: "PREVIA", versionId: x.a.versionDraft })).status).toBe(403);
    const list = await api(x.cookie.ownerA).get(`${PORTAL}?pageSize=50`);
    expect(list.status).toBe(200);
    const items = (list.json as { items: { id: string; uploadedById?: string }[] }).items;
    for (const i of items) expect(i).not.toHaveProperty("uploadedById");
    expect(list.text).not.toContain("storageKey");
  });
});

describe("limite de tentativas por pessoa, CSRF e corpo invalido ou gigante", () => {
  it("pedidos de envio: acima do limite 429 com Retry-After; outra pessoa nao e afetada (instancia de limites baixos)", async () => {
    const u = await freshUser("rate");
    const data = png(1000);
    for (let i = 0; i < 4; i++) {
      const up = await uploadVia(u.cookie, PORTAL, { originalName: `r${i}.png`, mimeType: "image/png", bytes: data.length }, data, { base: BASE_LOW });
      expect(up.put?.status, `envio ${i}`).toBe(201);
    }
    const blocked = await http(PORTAL, { method: "POST", cookie: u.cookie, base: BASE_LOW, body: { originalName: "r5.png", mimeType: "image/png", bytes: 10 } });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(err(blocked)?.code).toBe("RATE_LIMITED");
    const other = await freshUser("rate2");
    expect((await http(PORTAL, { method: "POST", cookie: other.cookie, base: BASE_LOW, body: { originalName: "ok.png", mimeType: "image/png", bytes: 10 } })).status).toBe(201);
  }, 60_000);

  it("pendentes simultaneos por pessoa (3 neste ambiente): o quarto pedido recebe 429", async () => {
    const u = await freshUser("pend");
    for (let i = 0; i < 3; i++) {
      expect((await http(PORTAL, { method: "POST", cookie: u.cookie, base: BASE_LOW, body: { originalName: `p${i}.png`, mimeType: "image/png", bytes: 10 } })).status).toBe(201);
    }
    expect((await http(PORTAL, { method: "POST", cookie: u.cookie, base: BASE_LOW, body: { originalName: "p4.png", mimeType: "image/png", bytes: 10 } })).status).toBe(429);
  });

  it("links de download: 4 por janela e por pessoa neste ambiente, o quinto recebe 429", async () => {
    const u = await freshUser("dlrate");
    const data = png(1000);
    const up = await uploadVia(u.cookie, PORTAL, { originalName: "d.png", mimeType: "image/png", bytes: data.length }, data);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await http(`${PORTAL}/${up.assetId}/download`, { method: "POST", cookie: u.cookie, base: BASE_LOW })).status);
    expect(statuses).toEqual([200, 200, 200, 200, 429]);
  });

  it("CSRF: pedido, envio e download de outra origem, ou sem Origin, sao 403 (mesmo com cookie valido); GET de link nao muda estado", async () => {
    const body = { originalName: "csrf.png", mimeType: "image/png", bytes: 10 };
    const before = await ownerDb.asset.count({ where: { uploadedById: x.w.ownerA.id } });
    for (const origin of ["https://evil.example", "http://127.0.0.1:3101", null]) {
      const r = await http(PORTAL, { method: "POST", cookie: x.cookie.ownerA, body, origin });
      expect(r.status, String(origin)).toBe(403);
    }
    const init = await api(x.cookie.ownerA).post(PORTAL, { ...body });
    const p = (init.json as { path: string }).path;
    const put = await http(p, { method: "PUT", cookie: x.cookie.ownerA, rawBody: png(10), contentType: "application/octet-stream", origin: "https://evil.example" });
    expect(put.status).toBe(403);
    const del = await http(`${PORTAL}/${x.a.assetAvailable}`, { method: "DELETE", cookie: x.cookie.ownerA, origin: "https://evil.example" });
    expect(del.status).toBe(403);
    const dec = await http(`/api/portal/contents/${x.a.contentShared}/versions/${x.a.versionSent}/decision`, { method: "POST", cookie: x.cookie.ownerA, body: { decision: "APROVADO" }, origin: null });
    expect(dec.status).toBe(403);
    expect(await ownerDb.asset.count({ where: { uploadedById: x.w.ownerA.id } })).toBe(before + 1);
  });

  it("corpo JSON invalido (400), gigante (413) e de tipo errado; campo desconhecido (422); nada vaza", async () => {
    const bad = await http(PORTAL, { method: "POST", cookie: x.cookie.ownerA, rawBody: "{nao e json", contentType: "application/json" });
    expect(bad.status).toBe(400);
    expectNoLeak(bad);
    const giant = await http(PORTAL, { method: "POST", cookie: x.cookie.ownerA, rawBody: `{"originalName":"${"a".repeat(2 * 1024 * 1024)}"}`, contentType: "application/json" });
    expect(giant.status).toBe(413);
    expectNoLeak(giant);
    expect((await http(PORTAL, { method: "POST", cookie: x.cookie.ownerA, rawBody: "originalName=a.png", contentType: "application/x-www-form-urlencoded" })).status).toBe(400);
    expect((await http(PORTAL, { method: "POST", cookie: x.cookie.ownerA, body: { originalName: "a.png", mimeType: "image/png", bytes: 10, clientId: x.w.clientB, storageKey: "x" } })).status).toBe(422);
    expect((await http(PORTAL, { method: "POST", cookie: x.cookie.ownerA, body: [] })).status).toBe(422);
    expect((await http(PORTAL, { method: "POST", cookie: x.cookie.ownerA, body: "null" })).status).toBe(422);
    // listagem: parametros invalidos viram 422, nunca 500
    for (const q of ["page=0", "page=abc", "pageSize=1000", "sort=storageKey", "status=EXCLUIDO", "dir=sideways"]) {
      const r = await http(`${PORTAL}?${q}`, { cookie: x.cookie.ownerA });
      expect(r.status, q).toBe(422);
      expectNoLeak(r);
    }
  });

  it("listagem paginada, filtrada e ordenada no servidor; o cliente so ve o que e dele", async () => {
    const list = await api(x.cookie.ownerA).get(`${PORTAL}?pageSize=2&page=1&sort=originalName&dir=asc&category=IMAGEM&status=DISPONIVEL`);
    expect(list.status).toBe(200);
    const body = list.json as { items: { id: string; originalName: string; category: string; status: string }[]; total: number; page: number; pageSize: number };
    expect(body.items.length).toBeLessThanOrEqual(2);
    expect(body.total).toBeGreaterThan(2);
    expect(body.items.every((i) => i.category === "IMAGEM" && i.status === "DISPONIVEL")).toBe(true);
    const names = body.items.map((i) => i.originalName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
    const p2 = (await api(x.cookie.ownerA).get(`${PORTAL}?pageSize=2&page=2&sort=originalName&dir=asc&category=IMAGEM&status=DISPONIVEL`)).json as { items: { id: string }[] };
    expect(p2.items.some((i) => body.items.some((j) => j.id === i.id))).toBe(false);
    const search = await api(x.cookie.ownerA).get(`${PORTAL}?q=ARTE`);
    expect((search.json as { items: { originalName: string }[] }).items.every((i) => /arte/i.test(i.originalName))).toBe(true);
    // a agencia ve tambem os campos de gestao
    const adminList = await api(x.cookie.admin).get(`${ADMIN()}?pageSize=5`);
    expect((adminList.json as { items: Record<string, unknown>[] }).items[0]).toHaveProperty("checksumSha256");
    expect(adminList.text).not.toContain("storageKey");
  });
});

describe("armazenamento indisponivel", () => {
  it("o app de teste nao deixa sobra: nenhuma chave de arquivo REJEITADO ou EXCLUIDO continua no disco", async () => {
    const dead = await ownerDb.asset.findMany({ where: { status: { in: ["REJEITADO", "EXCLUIDO"] }, clientId: { in: [x.w.clientA, x.w.clientB] } }, select: { storageKey: true } });
    expect(dead.length).toBeGreaterThan(0);
    const keys = new Set(await listStoredKeys());
    for (const d of dead) expect(keys.has(d.storageKey), d.storageKey).toBe(false);
  });
});
