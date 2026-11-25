import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveTenantContext, type TenantContext } from "@/server/authorization/context";
import { signToken, signingSecret } from "@/server/storage/signed-token";
import { createLocalStorage } from "@/server/storage/local-disk";
import { attachAsset, detachAsset } from "@/server/services/assets";
import { bindInstallation, cleanupFiles, deliverDownload, receiveUpload, removeAsset, requestDownload, requestUpload, type FileDeps } from "@/server/services/files";
import { appDb, makeUser, addMember, makeWorld, ownerDb, type World } from "./helpers/world";
import { makePhase2, type Phase2Data } from "./helpers/phase2";

// R-5 no nivel do servico, contra nexo_test e um disco temporario: tipo real, limites, token vinculado, reautorizacao
// a cada entrega e limpeza idempotente. O HTTP real fica em tests/http/arquivos.test.ts.

const MB = 1024 * 1024;
const NL = String.fromCharCode(10);
let w: World;
let p2: Phase2Data;
let root: string;
let deps: FileDeps;
let admin: TenantContext;
let ownerA: TenantContext;
let collabA: TenantContext;
let ownerB: TenantContext;
const clock = new Date();
const secret = signingSecret({ BETTER_AUTH_SECRET: "t".repeat(40) });

const body = (buf: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < buf.length; i += 65536) c.enqueue(buf.subarray(i, i + 65536));
      c.close();
    },
  });
const png = (size: number) => {
  const b = Buffer.alloc(size, 9);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  return b;
};
const pdf = (size: number) => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(size - 9, 32)]);
const mp4 = (size: number) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(size - 12, 0)]);
const tokenOf = (path: string) => path.split("/").pop()!;

async function upload(ctx: TenantContext, meta: { originalName: string; mimeType: string; bytes: number; visibility?: "INTERNO" | "COMPARTILHADO" }, data: Uint8Array | null, contentLength: number | null = data?.length ?? null) {
  const target = await requestUpload(appDb, ctx, deps, meta);
  const sent = await receiveUpload(appDb, deps, { token: tokenOf(target.path), sessionUserId: ctx.userId, body: data ? body(data) : null, contentLength });
  return { target, sent };
}
const row = (id: string) => ownerDb.asset.findUniqueOrThrow({ where: { id } });
const objectExists = async (id: string) => !!(await deps.storage.open((await row(id)).storageKey).then(async (o) => { await o?.stream.cancel(); return o; }));

beforeAll(async () => {
  w = await makeWorld();
  p2 = await makePhase2(w.clientA, w.admin.id, w.ownerA.id);
  root = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-storage-int-"));
  deps = {
    storage: createLocalStorage(root),
    secret,
    limits: { IMAGEM: 1 * MB, DOCUMENTO: 2 * MB, VIDEO: 3 * MB },
    uploadTtlSeconds: 900,
    downloadTtlSeconds: 60,
    maxPendingPerUser: 5,
    clientQuotaBytes: 0,
    globalQuotaBytes: 0,
    minFreeBytes: 0,
    now: () => clock,
  };
  // Pasta e banco da mesma instalacao: a limpeza so roda com o identificador vinculado (M-A).
  await bindInstallation(appDb, deps.storage);
  admin = await resolveTenantContext(appDb, { userId: w.admin.id, activeClientId: w.clientA });
  ownerA = await resolveTenantContext(appDb, { userId: w.ownerA.id, activeClientId: w.clientA });
  collabA = await resolveTenantContext(appDb, { userId: w.collabA.id, activeClientId: w.clientA });
  ownerB = await resolveTenantContext(appDb, { userId: w.ownerB.id, activeClientId: w.clientB });
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("pedido de envio (declaracao)", () => {
  it("recusa nome perigoso, tipo fora da lista, vazio, acima do limite e nome com controle ou inversao de texto", async () => {
    const png1 = (name: string, extra: object = {}) => requestUpload(appDb, ownerA, deps, { originalName: name, mimeType: "image/png", bytes: 100, ...extra });
    for (const name of ["foto.jpg.exe", "foto.png.html", "a.svg", "script.sh.png", "FOTO.JPG.EXE", "x.docm", "x.png.js"]) {
      await expect(png1(name), name).rejects.toMatchObject({ code: "BLOCKED_EXTENSION", status: 422 });
    }
    for (const mimeType of ["text/html", "image/svg+xml", "application/x-msdownload", "application/zip", "application/octet-stream", "image/gif"]) {
      await expect(requestUpload(appDb, ownerA, deps, { originalName: "a.png", mimeType, bytes: 100 }), mimeType).rejects.toMatchObject({ code: "TYPE_NOT_ALLOWED" });
    }
    await expect(png1("a.png", { bytes: 0 })).rejects.toMatchObject({ code: "EMPTY" });
    await expect(png1("a.png", { bytes: 1 * MB + 1 })).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE", status: 413 });
    await expect(png1("a\u0000.png")).rejects.toMatchObject({ code: "INVALID_NAME" });
    await expect(png1("a‮gnp.exe")).rejects.toMatchObject({ code: "INVALID_NAME" });
    await expect(png1("x".repeat(256))).rejects.toMatchObject({ code: "INVALID_NAME" });
    // nada disso criou registro
    expect(await ownerDb.asset.count({ where: { clientId: w.clientA, uploadedById: w.ownerA.id, originalName: { startsWith: "foto" } } })).toBe(0);
  });

  it("limite de envios pendentes por pessoa e cota do cliente (409/429 e 422)", async () => {
    const user = await makeUser("USER", "pendente");
    await addMember(w.clientA, user.id, "CLIENT_COLLABORATOR");
    const ctx = await resolveTenantContext(appDb, { userId: user.id, activeClientId: w.clientA });
    for (let i = 0; i < 5; i++) await requestUpload(appDb, ctx, deps, { originalName: `p${i}.png`, mimeType: "image/png", bytes: 10 });
    await expect(requestUpload(appDb, ctx, deps, { originalName: "p6.png", mimeType: "image/png", bytes: 10 })).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
    // outra pessoa do mesmo cliente nao e afetada (limite por pessoa, nunca global)
    await expect(requestUpload(appDb, ownerA, deps, { originalName: "livre.png", mimeType: "image/png", bytes: 10 })).resolves.toBeTruthy();
    // cota do cliente: soma os bytes declarados e os disponiveis
    const tight = { ...deps, clientQuotaBytes: 50 * MB };
    const used = await ownerDb.asset.aggregate({ where: { clientId: w.clientA, OR: [{ status: "DISPONIVEL" }, { status: "PENDENTE" }] }, _sum: { bytes: true } });
    const small = { ...tight, clientQuotaBytes: Number(used._sum.bytes ?? 0) + 5 };
    await expect(requestUpload(appDb, ownerA, small, { originalName: "cota.png", mimeType: "image/png", bytes: 100 })).rejects.toMatchObject({ code: "STORAGE_QUOTA_EXCEEDED" });
  });
});

describe("recebimento: tipo real, tamanho e estados", () => {
  it("imagem, PDF e video validos ficam DISPONIVEIS com tipo, tamanho e SHA-256 medidos pelo servidor", async () => {
    const cases = [
      { name: "arte.png", mime: "image/png", data: png(5000), cat: "IMAGEM" },
      { name: "roteiro.pdf", mime: "application/pdf", data: pdf(70_000), cat: "DOCUMENTO" },
      { name: "video.MP4", mime: "video/mp4", data: mp4(200_000), cat: "VIDEO" },
    ];
    for (const c of cases) {
      const { target, sent } = await upload(ownerA, { originalName: c.name, mimeType: c.mime, bytes: c.data.length }, c.data);
      expect(sent.status).toBe("DISPONIVEL");
      const r = await row(target.assetId);
      expect(r).toMatchObject({ status: "DISPONIVEL", mimeType: c.mime, category: c.cat, bytes: BigInt(c.data.length), scanStatus: "NAO_VERIFICADO" });
      expect(r.checksumSha256).toBe(createHash("sha256").update(c.data).digest("hex"));
      expect(r.storageKey).toMatch(new RegExp(`^clients/${w.clientA}/[0-9a-f-]{36}$`));
      expect(r.storageKey).not.toContain(c.name); // chave sem nome original nem extensao
      expect(await objectExists(target.assetId)).toBe(true);
      expect(await ownerDb.auditLog.count({ where: { action: "asset.finalized", entityId: target.assetId } })).toBe(1);
    }
  });

  it("arquivo malicioso: executavel disfarcado de imagem, HTML, SVG, MIME mentiroso e extensao trocada viram REJEITADO e o objeto some", async () => {
    const evil: { label: string; meta: { originalName: string; mimeType: string }; data: Buffer; code: string }[] = [
      { label: "exe como png", meta: { originalName: "arte.png", mimeType: "image/png" }, data: Buffer.concat([Buffer.from("MZ\x90\x00"), Buffer.alloc(2000)]), code: "TYPE_UNRECOGNIZED" },
      { label: "html como jpg", meta: { originalName: "foto.jpg", mimeType: "image/jpeg" }, data: Buffer.from("<html><script>alert(1)</script></html>".padEnd(1000, " ")), code: "TYPE_UNRECOGNIZED" },
      { label: "svg como png", meta: { originalName: "logo.png", mimeType: "image/png" }, data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'.padEnd(500, " ")), code: "TYPE_UNRECOGNIZED" },
      { label: "png declarado jpeg", meta: { originalName: "arte.jpg", mimeType: "image/jpeg" }, data: png(3000), code: "TYPE_MISMATCH" },
      { label: "pdf com nome .png", meta: { originalName: "arte.png", mimeType: "application/pdf" }, data: pdf(3000), code: "EXTENSION_MISMATCH" },
      { label: "mkv como webm", meta: { originalName: "v.webm", mimeType: "video/webm" }, data: Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88]), Buffer.from("matroska"), Buffer.alloc(2000)]), code: "TYPE_UNRECOGNIZED" },
    ];
    for (const e of evil) {
      const target = await requestUpload(appDb, ownerA, deps, { ...e.meta, bytes: e.data.length });
      await expect(receiveUpload(appDb, deps, { token: tokenOf(target.path), sessionUserId: w.ownerA.id, body: body(e.data), contentLength: e.data.length }), e.label).rejects.toMatchObject({ code: e.code, status: 422 });
      expect((await row(target.assetId)).status, e.label).toBe("REJEITADO");
      expect(await objectExists(target.assetId), e.label).toBe(false);
      expect(await ownerDb.auditLog.count({ where: { action: "asset.rejected", entityId: target.assetId } }), e.label).toBe(1);
      // REJEITADO nunca baixa
      await expect(requestDownload(appDb, ownerA, deps, target.assetId), e.label).rejects.toMatchObject({ status: 404 });
    }
  });

  it("acima do limite e rejeitado com 413 (por Content-Length e por contagem em streaming); zero byte e recusado", async () => {
    const big = png(1 * MB);
    const t1 = await requestUpload(appDb, ownerA, deps, { originalName: "g.png", mimeType: "image/png", bytes: big.length });
    // Content-Length maior que o declarado: nem le o corpo
    await expect(receiveUpload(appDb, deps, { token: tokenOf(t1.path), sessionUserId: w.ownerA.id, body: body(big), contentLength: big.length + 10 })).rejects.toMatchObject({ status: 413 });
    expect((await row(t1.assetId)).status).toBe("REJEITADO");
    // sem Content-Length (chunked): a contagem em streaming derruba
    const t2 = await requestUpload(appDb, ownerA, deps, { originalName: "g2.png", mimeType: "image/png", bytes: 1000 });
    await expect(receiveUpload(appDb, deps, { token: tokenOf(t2.path), sessionUserId: w.ownerA.id, body: body(png(5000)), contentLength: null })).rejects.toMatchObject({ status: 413 });
    expect((await row(t2.assetId)).status).toBe("REJEITADO");
    expect(await objectExists(t2.assetId)).toBe(false);
    const t3 = await requestUpload(appDb, ownerA, deps, { originalName: "z.png", mimeType: "image/png", bytes: 10 });
    await expect(receiveUpload(appDb, deps, { token: tokenOf(t3.path), sessionUserId: w.ownerA.id, body: body(new Uint8Array(0)), contentLength: null })).rejects.toMatchObject({ code: "EMPTY" });
    expect((await row(t3.assetId)).status).toBe("REJEITADO");
  });

  it("envio interrompido ou incompleto nao deixa DISPONIVEL: segue PENDENTE, sem objeto, e o mesmo alvo ainda vale", async () => {
    const data = png(4000);
    const target = await requestUpload(appDb, ownerA, deps, { originalName: "meio.png", mimeType: "image/png", bytes: data.length });
    const broken = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(data.subarray(0, 1500));
      },
      pull(c) {
        c.error(new Error("conexao caiu"));
      },
    });
    await expect(receiveUpload(appDb, deps, { token: tokenOf(target.path), sessionUserId: w.ownerA.id, body: broken, contentLength: null })).rejects.toThrow();
    expect((await row(target.assetId)).status).toBe("PENDENTE");
    expect(await objectExists(target.assetId)).toBe(false);
    // terminou "bem", mas com menos bytes que o declarado
    await expect(receiveUpload(appDb, deps, { token: tokenOf(target.path), sessionUserId: w.ownerA.id, body: body(data.subarray(0, 1000)), contentLength: null })).rejects.toMatchObject({ code: "INCOMPLETE_UPLOAD" });
    expect((await row(target.assetId)).status).toBe("PENDENTE");
    expect(await objectExists(target.assetId)).toBe(false);
    // retomar = mandar de novo no mesmo alvo
    const ok = await receiveUpload(appDb, deps, { token: tokenOf(target.path), sessionUserId: w.ownerA.id, body: body(data), contentLength: data.length });
    expect(ok).toMatchObject({ status: "DISPONIVEL", replayed: false });
  });

  it("idempotente: repetir o envio devolve o mesmo resultado sem gravar de novo; envios simultaneos geram um so objeto", async () => {
    const data = png(3000);
    const { target, sent } = await upload(ownerA, { originalName: "dup.png", mimeType: "image/png", bytes: data.length }, data);
    const again = await receiveUpload(appDb, deps, { token: tokenOf(target.path), sessionUserId: w.ownerA.id, body: body(data), contentLength: data.length });
    expect(again).toMatchObject({ id: sent.id, replayed: true, checksumSha256: sent.checksumSha256 });
    expect(await ownerDb.auditLog.count({ where: { action: "asset.finalized", entityId: target.assetId } })).toBe(1);

    const racy = await requestUpload(appDb, ownerA, deps, { originalName: "corrida.png", mimeType: "image/png", bytes: data.length });
    const results = await Promise.allSettled(
      [0, 1, 2, 3].map(() => receiveUpload(appDb, deps, { token: tokenOf(racy.path), sessionUserId: w.ownerA.id, body: body(data), contentLength: data.length })),
    );
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ status: 409 });
    expect((await row(racy.assetId)).status).toBe("DISPONIVEL");
    expect(await ownerDb.auditLog.count({ where: { action: "asset.finalized", entityId: racy.assetId } })).toBe(1);
  });
});

describe("token de envio: vinculado a pessoa, cliente e arquivo; vence", () => {
  it("de outra pessoa, adulterado, de outro cliente e vencido (410 so para a pessoa certa)", async () => {
    const data = png(2000);
    const target = await requestUpload(appDb, ownerA, deps, { originalName: "t.png", mimeType: "image/png", bytes: data.length });
    const token = tokenOf(target.path);
    const send = (t: string, user: string) => receiveUpload(appDb, deps, { token: t, sessionUserId: user, body: body(data), contentLength: data.length });
    await expect(send(token, w.collabA.id)).rejects.toMatchObject({ status: 404 }); // colega do mesmo cliente
    await expect(send(token, w.ownerB.id)).rejects.toMatchObject({ status: 404 }); // outro cliente
    await expect(send(token.slice(0, -3) + "AAA", w.ownerA.id)).rejects.toMatchObject({ status: 404 });
    // assinado de verdade, mas para outro cliente e o arquivo do A: o token do B nao abre o arquivo do A
    const forgedForB = signToken(secret, { purpose: "upload", assetId: target.assetId, clientId: w.clientB, userId: w.ownerB.id, expiresAt: Math.floor(clock.getTime() / 1000) + 600 });
    await expect(send(forgedForB, w.ownerB.id)).rejects.toMatchObject({ status: 404 });
    // vencido
    const later = { ...deps, now: () => new Date(clock.getTime() + 16 * 60_000) };
    await expect(receiveUpload(appDb, later, { token, sessionUserId: w.ownerA.id, body: body(data), contentLength: data.length })).rejects.toMatchObject({ status: 410, code: "LINK_EXPIRED" });
    // vencido, mas de outra pessoa: continua 404 (nao revela que a assinatura era valida)
    await expect(receiveUpload(appDb, later, { token, sessionUserId: w.collabA.id, body: body(data), contentLength: data.length })).rejects.toMatchObject({ status: 404 });
    expect((await row(target.assetId)).status).toBe("PENDENTE");
  });

  it("perdeu o acesso (membro revogado) = token antigo morre", async () => {
    const user = await makeUser("USER", "saiu");
    const m = await addMember(w.clientA, user.id, "CLIENT_COLLABORATOR");
    const ctx = await resolveTenantContext(appDb, { userId: user.id, activeClientId: w.clientA });
    const data = png(2000);
    const target = await requestUpload(appDb, ctx, deps, { originalName: "saiu.png", mimeType: "image/png", bytes: data.length });
    await ownerDb.clientMember.update({ where: { id: m.id }, data: { status: "REVOKED" } });
    await expect(receiveUpload(appDb, deps, { token: tokenOf(target.path), sessionUserId: user.id, body: body(data), contentLength: data.length })).rejects.toMatchObject({ status: 404 });
  });
});

describe("download: autorizacao na emissao e na entrega", () => {
  let mine: string; // arquivo do dono do A (compartilhado), sem vinculo
  let internal: string; // arquivo INTERNO da agencia
  const data = png(4000);

  beforeAll(async () => {
    mine = (await upload(ownerA, { originalName: "meu arquivo.png", mimeType: "image/png", bytes: data.length }, data)).target.assetId;
    internal = (await upload(admin, { originalName: "interno.png", mimeType: "image/png", bytes: data.length, visibility: "INTERNO" }, data)).target.assetId;
  });

  it("quem enviou e a agencia baixam; os bytes voltam identicos; o link e curto e vinculado", async () => {
    const link = await requestDownload(appDb, ownerA, deps, mine);
    expect(link.path).toMatch(/^\/api\/files\/download\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(new Date(link.expiresAt).getTime() - clock.getTime()).toBeLessThanOrEqual(60_000);
    const file = await deliverDownload(appDb, deps, { token: tokenOf(link.path), sessionUserId: w.ownerA.id });
    expect(file).toMatchObject({ mimeType: "image/png", originalName: "meu arquivo.png", bytes: data.length });
    expect(Buffer.from(await new Response(file.stream).arrayBuffer()).equals(data)).toBe(true);
    const asAdmin = await requestDownload(appDb, admin, deps, mine);
    await expect(deliverDownload(appDb, deps, { token: tokenOf(asAdmin.path), sessionUserId: w.admin.id })).resolves.toBeTruthy();
  });

  it("outro cliente, colega sem vinculo e arquivo interno: 404 na emissao; PENDENTE nunca baixa", async () => {
    await expect(requestDownload(appDb, ownerB, deps, mine)).rejects.toMatchObject({ status: 404 });
    await expect(requestDownload(appDb, collabA, deps, mine)).rejects.toMatchObject({ status: 404 });
    await expect(requestDownload(appDb, ownerA, deps, internal)).rejects.toMatchObject({ status: 404 });
    await expect(requestDownload(appDb, ownerA, deps, randomUUID())).rejects.toMatchObject({ status: 404 });
    const pending = await requestUpload(appDb, ownerA, deps, { originalName: "p.png", mimeType: "image/png", bytes: 10 });
    await expect(requestDownload(appDb, ownerA, deps, pending.assetId)).rejects.toMatchObject({ status: 404 });
    await expect(requestDownload(appDb, ownerA, deps, p2.assetPending)).rejects.toMatchObject({ status: 404 });
  });

  it("link de outra pessoa, de outro cliente, adulterado e vencido nao entregam; perder o acesso mata o link antigo", async () => {
    const link = await requestDownload(appDb, ownerA, deps, mine);
    const t = tokenOf(link.path);
    const get = (token: string, user: string, d = deps) => deliverDownload(appDb, d, { token, sessionUserId: user });
    await expect(get(t, w.collabA.id)).rejects.toMatchObject({ status: 404 });
    await expect(get(t, w.ownerB.id)).rejects.toMatchObject({ status: 404 });
    await expect(get(t.replace(/.$/, (c) => (c === "A" ? "B" : "A")), w.ownerA.id)).rejects.toMatchObject({ status: 404 });
    // assinatura valida para o B apontando para arquivo do A: o B nao tem acesso ao arquivo
    const forged = signToken(secret, { purpose: "download", assetId: mine, clientId: w.clientB, userId: w.ownerB.id, expiresAt: Math.floor(clock.getTime() / 1000) + 60 });
    await expect(get(forged, w.ownerB.id)).rejects.toMatchObject({ status: 404 });
    // e o mesmo token com clientId do A e userId do B nao existe: so a combinacao assinada vale
    const mixed = signToken(secret, { purpose: "download", assetId: mine, clientId: w.clientA, userId: w.ownerB.id, expiresAt: Math.floor(clock.getTime() / 1000) + 60 });
    await expect(get(mixed, w.ownerB.id)).rejects.toMatchObject({ status: 404 });
    // vencido (relogio simulado)
    const later = { ...deps, now: () => new Date(clock.getTime() + 61_000) };
    await expect(get(t, w.ownerA.id, later)).rejects.toMatchObject({ status: 410 });
    // perdeu acesso depois de emitir
    const user = await makeUser("USER", "dl");
    const m = await addMember(w.clientA, user.id, "CLIENT_COLLABORATOR");
    const ctx = await resolveTenantContext(appDb, { userId: user.id, activeClientId: w.clientA });
    const own = (await upload(ctx, { originalName: "dl.png", mimeType: "image/png", bytes: data.length }, data)).target.assetId;
    const l2 = await requestDownload(appDb, ctx, deps, own);
    await expect(get(tokenOf(l2.path), user.id)).resolves.toBeTruthy();
    await ownerDb.user.update({ where: { id: user.id }, data: { banned: true } });
    await expect(get(tokenOf(l2.path), user.id)).rejects.toMatchObject({ status: 404 });
    await ownerDb.user.update({ where: { id: user.id }, data: { banned: false } });
    await ownerDb.clientMember.update({ where: { id: m.id }, data: { status: "REVOKED" } });
    await expect(get(tokenOf(l2.path), user.id)).rejects.toMatchObject({ status: 404 });
  });

  it("objeto sumiu do disco: 404 honesto (e registro no log), sem sucesso falso", async () => {
    const gone = (await upload(ownerA, { originalName: "sumiu.png", mimeType: "image/png", bytes: data.length }, data)).target.assetId;
    const link = await requestDownload(appDb, ownerA, deps, gone);
    await deps.storage.delete((await row(gone)).storageKey);
    await expect(deliverDownload(appDb, deps, { token: tokenOf(link.path), sessionUserId: w.ownerA.id })).rejects.toMatchObject({ status: 404 });
  });

  it("arquivo excluido deixa de baixar e o objeto sai do disco; arquivo de versao enviada nao se exclui nem se desliga", async () => {
    const x = (await upload(ownerA, { originalName: "apagar.png", mimeType: "image/png", bytes: data.length }, data)).target.assetId;
    const link = await requestDownload(appDb, ownerA, deps, x);
    await removeAsset(appDb, ownerA, deps, x);
    expect((await row(x)).status).toBe("EXCLUIDO");
    expect(await objectExists(x)).toBe(false);
    await expect(deliverDownload(appDb, deps, { token: tokenOf(link.path), sessionUserId: w.ownerA.id })).rejects.toMatchObject({ status: 404 });
    await removeAsset(appDb, ownerA, deps, x).then(
      () => expect.unreachable(),
      (e) => expect(e).toMatchObject({ status: 404 }),
    );
    // ligado a versao ENVIADA (fixture): a exclusao e recusada pelo banco
    await expect(removeAsset(appDb, admin, deps, p2.assetAvailable)).rejects.toThrow();
    expect((await row(p2.assetAvailable)).status).toBe("DISPONIVEL");
    await expect(detachAsset(appDb, admin, p2.linkSent)).rejects.toThrow();
    // anexar a versao ja enviada tambem e recusado
    const a = (await upload(admin, { originalName: "nova.png", mimeType: "image/png", bytes: data.length }, data)).target.assetId;
    await expect(attachAsset(appDb, admin, { assetId: a, role: "PREVIA", versionId: p2.versionSent })).rejects.toThrow();
  });
});

describe("limpeza idempotente (pendentes, orfaos e temporarios com mais de 24 h)", () => {
  it("apaga pendente abandonado e temporario velho, move o orfao para a lixeira; nunca toca arquivo DISPONIVEL; segunda rodada nao muda nada", async () => {
    const data = png(2000);
    const keep = (await upload(ownerA, { originalName: "fica.png", mimeType: "image/png", bytes: data.length }, data)).target.assetId;
    const stale = await requestUpload(appDb, ownerA, deps, { originalName: "abandonado.png", mimeType: "image/png", bytes: 100 });
    // objeto orfao (sem registro) e temporario velho
    const orphanKey = `clients/${w.clientA}/${randomUUID()}`;
    await deps.storage.put(orphanKey, body(Buffer.from("orfao")), { maxBytes: 100 });
    await fs.mkdir(path.join(root, ".tmp"), { recursive: true });
    const tmp = path.join(root, ".tmp", `${randomUUID()}.part`);
    await fs.writeFile(tmp, "sobra");

    // agora: nada muda (tudo e recente)
    const fresh = await cleanupFiles(appDb, deps.storage, { now: new Date() });
    expect(fresh).toMatchObject({ pendingExpired: 0, orphanObjectsTrashed: 0, tempRemoved: 0 });
    expect((await row(stale.assetId)).status).toBe("PENDENTE");

    const future = new Date(Date.now() + 25 * 3600_000);
    const first = await cleanupFiles(appDb, deps.storage, { now: future });
    expect(first.pendingExpired).toBeGreaterThanOrEqual(1);
    expect(first.orphanObjectsTrashed).toBeGreaterThanOrEqual(1);
    expect(first.tempRemoved).toBeGreaterThanOrEqual(1);
    expect((await row(stale.assetId)).status).toBe("EXCLUIDO");
    expect(await deps.storage.open(orphanKey)).toBeNull();
    // o orfao NAO foi apagado: esta na lixeira, dentro da raiz do armazenamento
    expect(await fs.stat(path.join(root, ".trash", orphanKey)).then((st) => st.isFile(), () => false)).toBe(true);
    expect(await fs.stat(tmp).then(() => true, () => false)).toBe(false);
    expect(await ownerDb.auditLog.count({ where: { action: "asset.pending_purged", entityId: stale.assetId } })).toBe(1);
    // DISPONIVEL intacto (so o objeto antigo seria candidato, e ele tem registro valido)
    expect((await row(keep)).status).toBe("DISPONIVEL");
    expect(await objectExists(keep)).toBe(true);

    const second = await cleanupFiles(appDb, deps.storage, { now: future });
    expect(second).toEqual({ pendingExpired: 0, deletedObjectsRemoved: 0, orphanObjectsTrashed: 0, trashPurged: 0, tempRemoved: 0 });
  });
});

describe("comando de limpeza (scripts/limpar-arquivos.mjs)", () => {
  const script = path.resolve(__dirname, "../../scripts/limpar-arquivos.mjs");
  const cli = (dir: string, args: string[], extraEnv: Record<string, string> = {}) =>
    spawnSync(process.execPath, [script, ...args], { env: { ...process.env, STORAGE_LOCAL_DIR: dir, NODE_ENV: "test", ...extraEnv }, encoding: "utf8" });
  const lastJson = (text: string) => JSON.parse(text.trim().split(NL).pop()!) as Record<string, unknown>;
  const ago = (hours: number) => new Date(Date.now() - hours * 3600_000);

  it("roda contra nexo_test com o papel do app, vincula a instalacao so quando pedido, imprime so contadores, e a segunda execucao nao muda nada", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-storage-cli-"));
    try {
      const cliStorage = createLocalStorage(dir);
      // pendente abandonado ha 3 h (criado ja velho: o minimo do comando e 1 h) e orfao com mtime de 3 h atras
      const target = await ownerDb.asset.create({
        data: { clientId: w.clientA, storageKey: `clients/${w.clientA}/${randomUUID()}`, originalName: "cli.png", uploadedById: w.ownerA.id, mimeType: "image/png", bytes: 100, createdAt: ago(3) },
      });
      const orphan = `clients/${w.clientA}/${randomUUID()}`;
      await cliStorage.put(orphan, body(Buffer.from("orfao")), { maxBytes: 100 });
      await fs.utimes(path.join(dir, orphan), ago(3), ago(3));

      // sem identificador na pasta: aborta, codigo 3, NADA e tocado e nada e criado em silencio
      const semVinculo = cli(dir, ["--ambiente", "test", "--horas", "1"]);
      expect(semVinculo.status, semVinculo.stderr).toBe(3);
      expect(lastJson(semVinculo.stderr)).toMatchObject({ ok: false, abortado: "INSTALL_ID_MISSING" });
      expect(await cliStorage.readInstallId()).toBeNull();
      expect((await row(target.id)).status).toBe("PENDENTE");
      expect(await cliStorage.open(orphan)).not.toBeNull();

      const first = cli(dir, ["--ambiente", "test", "--horas", "1", "--vincular-instalacao"]);
      expect(first.status, first.stderr).toBe(0);
      const out = lastJson(first.stdout);
      expect(out).toMatchObject({ ok: true, horas: 1, vinculo: "file-created", orphanObjectsTrashed: 1 });
      expect(out.pendingExpired as number).toBeGreaterThanOrEqual(1);
      expect(first.stdout + first.stderr).not.toMatch(/postgresql:|password|secret/i);
      expect((await row(target.id)).status).toBe("EXCLUIDO");
      // orfao na lixeira (nao apagado) e restauravel pelo mesmo comando
      expect(await cliStorage.open(orphan)).toBeNull();
      expect(await fs.stat(path.join(dir, ".trash", orphan)).then((st) => st.isFile(), () => false)).toBe(true);

      const second = cli(dir, ["--ambiente", "test", "--horas", "1"]);
      expect(second.status, second.stderr).toBe(0);
      expect(lastJson(second.stdout)).toMatchObject({ pendingExpired: 0, deletedObjectsRemoved: 0, orphanObjectsTrashed: 0, trashPurged: 0, tempRemoved: 0 });

      const restored = cli(dir, ["--ambiente", "test", "--restaurar", orphan]);
      expect(restored.status, restored.stderr).toBe(0);
      expect(lastJson(restored.stdout)).toMatchObject({ ok: true, restaurado: true });
      expect(await cliStorage.open(orphan)).not.toBeNull();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 90_000);

  it("recusa --horas 0, ambiente ausente e --ambiente que nao combina com o banco do destino (e nao toca em nada)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-storage-cli-"));
    try {
      const testUrl = process.env.TEST_DATABASE_URL!;
      const refused = (args: string[], env: Record<string, string> = {}) => {
        const r = cli(dir, args, env);
        expect(r.status, `${args.join(" ")}: ${r.stdout}${r.stderr}`).toBe(2);
        expect(r.stdout).toBe("");
        expect(r.stderr).not.toMatch(/postgresql:|password/i);
        return r.stderr;
      };
      refused(["--ambiente", "test", "--horas", "0"]);
      refused(["--ambiente", "test", "--horas", "0.5"]);
      refused(["--ambiente", "test", "--horas", "-3"]);
      refused(["--horas", "24"]); // sem --ambiente: nao existe mais padrao silencioso
      refused(["--ambiente", "staging"]);
      refused(["--ambiente", "test", "--retencao-dias", "0"]);
      // --ambiente e conferido contra o banco de verdade: o rotulo sozinho nao autoriza nada
      expect(refused(["--ambiente", "dev"], { DATABASE_URL: testUrl })).toMatch(/nexo_dev/);
      expect(refused(["--ambiente", "producao"], { DATABASE_URL: testUrl })).toMatch(/producao/);
      expect(refused(["--ambiente", "test"], { TEST_DATABASE_URL: "postgresql://nexo_app:x@db.exemplo.invalid:5432/nexo_prod" })).toMatch(/nexo_test/);
      expect(refused(["--ambiente", "producao"], { DATABASE_URL: "postgresql://nexo_app:x@db.exemplo.invalid:5432/nexo_prod", PROVISIONAR_HOST_PERMITIDO: "" })).toMatch(/PROVISIONAR_HOST_PERMITIDO/);
      expect(refused(["--ambiente", "producao"], { DATABASE_URL: "postgresql://nexo_app:x@db.exemplo.invalid:5432/nexo_prod", PROVISIONAR_HOST_PERMITIDO: "outro.exemplo.invalid" })).toMatch(/nao esta em/);
      expect(await createLocalStorage(dir).readInstallId()).toBeNull();
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 90_000);
});
