import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveTenantContext, type TenantContext } from "@/server/authorization/context";
import type { Db } from "@/server/db/client";
import { CleanupAbortedError } from "@/server/domain/cleanup-policy";
import { AssetQuarantinedError } from "@/server/errors";
import { createScript, editScript } from "@/server/services/scripts";
import { bindInstallation, cleanupFiles, deliverDownload, receiveUpload, requestDownload, requestUpload, type FileDeps } from "@/server/services/files";
import { createLocalStorage } from "@/server/storage/local-disk";
import { signingSecret } from "@/server/storage/signed-token";
import type { ObjectStorage } from "@/server/storage/types";
import { addMember, appDb, makeClient, makeUser, makeWorld, ownerDb, type World } from "./helpers/world";
import { sys } from "./helpers/phase2";

// M-A (limpeza de arquivos so com banco e pasta da mesma instalacao, orfao vai para a lixeira) e M-B (pedidos
// paralelos, cota, teto global e espaco livre) da revisao independente da fase 2. Banco nexo_test e pastas temporarias.

const MB = 1024 * 1024;
const HOUR = 3600_000;
const secret = signingSecret({ BETTER_AUTH_SECRET: "t".repeat(40) });
const roots: string[] = [];
let w: World;
let ownerA: TenantContext;

const body = (buf: Uint8Array) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(buf);
      c.close();
    },
  });
const png = (size: number) => {
  const b = Buffer.alloc(size, 9);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  return b;
};
const tokenOf = (p: string) => p.split("/").pop()!;

async function freshRoot() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-limpeza-"));
  roots.push(dir);
  return { dir, storage: createLocalStorage(dir) };
}

function depsFor(storage: ObjectStorage, over: Partial<FileDeps> = {}): FileDeps {
  return {
    storage,
    secret,
    limits: { IMAGEM: 1 * MB, DOCUMENTO: 2 * MB, VIDEO: 3 * MB },
    uploadTtlSeconds: 900,
    downloadTtlSeconds: 60,
    maxPendingPerUser: 1000,
    clientQuotaBytes: 0,
    globalQuotaBytes: 0,
    minFreeBytes: 0,
    now: () => new Date(),
    ...over,
  };
}

/** Coloca um objeto na pasta com a chave dada e a data de modificacao `ageHours` atras (mexe so no disco). */
async function putAged(dir: string, storage: ObjectStorage, key: string, ageHours: number, content = "x") {
  await storage.put(key, body(Buffer.from(content)), { maxBytes: 1000 });
  const when = new Date(Date.now() - ageHours * HOUR);
  await fs.utimes(path.join(dir, key), when, when);
}
const newKey = (clientId: string) => `clients/${clientId}/${randomUUID()}`;
const exists = (dir: string, key: string) => fs.stat(path.join(dir, key)).then((st) => st.isFile(), () => false);
const inTrash = (dir: string, key: string) => exists(dir, path.join(".trash", key));
const dbRow = (clientId: string, storageKey: string, status: "PENDENTE" | "DISPONIVEL") =>
  ownerDb.asset.create({
    data: {
      clientId,
      storageKey,
      originalName: "x.png",
      uploadedById: w.ownerA.id,
      status,
      ...(status === "DISPONIVEL" ? { mimeType: "image/png", category: "IMAGEM" as const, bytes: 1, checksumSha256: "a".repeat(64), finalizedAt: new Date() } : {}),
    },
  });
const ctxFor = (userId: string, clientId: string) => resolveTenantContext(appDb, { userId, activeClientId: clientId });

/** Banco que "nao conhece nenhum arquivo DISPONIVEL" (o resto passa para o banco real): simula o banco errado no servico. */
function dbWithoutAvailable(db: Db): Db {
  const wrapTx = (tx: Record<string, unknown>) =>
    new Proxy(tx, {
      get(t, p) {
        const v = t[p as string];
        if (p === "asset") {
          const asset = v as Record<string, (...a: unknown[]) => unknown>;
          return new Proxy(asset, {
            get(a, q) {
              if (q === "count") return async (args?: { where?: { status?: string } }) => (args?.where?.status === "DISPONIVEL" ? 0 : a.count(args));
              const f = a[q as string];
              return typeof f === "function" ? f.bind(a) : f;
            },
          });
        }
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
      },
    });
  return new Proxy(db as unknown as Record<string, unknown>, {
    get(t, p) {
      if (p === "$transaction") return (fn: (tx: Record<string, unknown>) => unknown, opts?: unknown) => (t.$transaction as (f: unknown, o?: unknown) => unknown)((tx: Record<string, unknown>) => fn(wrapTx(tx)), opts);
      const v = t[p as string];
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  }) as unknown as Db;
}

beforeAll(async () => {
  w = await makeWorld();
  ownerA = await ctxFor(w.ownerA.id, w.clientA);
});
afterAll(async () => {
  for (const r of roots) await fs.rm(r, { recursive: true, force: true });
});

describe("M-A: limpeza so com banco e pasta da mesma instalacao", () => {
  it("banco que nao conhece a pasta (banco errado ou backup antigo) + pasta cheia: NADA e apagado nem movido", async () => {
    const { dir, storage } = await freshRoot();
    await bindInstallation(appDb, storage);
    const keys = Array.from({ length: 30 }, () => newKey(w.clientA));
    for (const k of keys) await putAged(dir, storage, k, 3);
    await expect(cleanupFiles(appDb, storage, { maxAgeHours: 1 })).rejects.toMatchObject({ code: "TOO_MANY_ORPHANS" });
    for (const k of keys) expect(await exists(dir, k), k).toBe(true);
    await expect(fs.stat(path.join(dir, ".trash"))).rejects.toThrow();
    // mesmo que quem opera aceite o numero (flag explicita), o orfao so vai para a lixeira: nunca e apagado
    const accepted = await cleanupFiles(appDb, storage, { maxAgeHours: 1, maxOrphans: 1000, maxOrphanRatio: 1 }).catch((e) => e);
    // o banco tem arquivos DISPONIVEL de outros testes, entao o aceite explicito move para a lixeira
    expect(accepted).toMatchObject({ orphanObjectsTrashed: 30 });
    for (const k of keys) {
      expect(await exists(dir, k)).toBe(false);
      expect(await inTrash(dir, k), k).toBe(true);
    }
  });

  it("proporcao alta de orfaos (mesmo abaixo do teto absoluto) aborta; poucos orfaos entre muitos conhecidos passam", async () => {
    const { dir, storage } = await freshRoot();
    await bindInstallation(appDb, storage);
    const known = Array.from({ length: 3 }, () => newKey(w.clientA));
    for (const k of known) {
      await putAged(dir, storage, k, 3);
      await dbRow(w.clientA, k, "DISPONIVEL");
    }
    const orphans = Array.from({ length: 12 }, () => newKey(w.clientA));
    for (const k of orphans) await putAged(dir, storage, k, 3);
    // 12 de 15 = 80% (teto absoluto 20 nao foi passado)
    await expect(cleanupFiles(appDb, storage, { maxAgeHours: 1 })).rejects.toMatchObject({ code: "ORPHAN_RATIO" });
    for (const k of [...known, ...orphans]) expect(await exists(dir, k)).toBe(true);

    // controle: 1 orfao entre 10 conhecidos (9%) e plausivel e vai para a lixeira
    const ok = await freshRoot();
    await bindInstallation(appDb, ok.storage);
    for (let i = 0; i < 10; i++) {
      const k = newKey(w.clientA);
      await putAged(ok.dir, ok.storage, k, 3);
      await dbRow(w.clientA, k, "DISPONIVEL");
    }
    const lone = newKey(w.clientA);
    await putAged(ok.dir, ok.storage, lone, 3);
    expect(await cleanupFiles(appDb, ok.storage, { maxAgeHours: 1 })).toMatchObject({ orphanObjectsTrashed: 1 });
    expect(await inTrash(ok.dir, lone)).toBe(true);
  });

  it("banco sem nenhum arquivo DISPONIVEL enquanto a pasta tem muitos objetos: aborta (mesmo com so 1 orfao)", async () => {
    const { dir, storage } = await freshRoot();
    await bindInstallation(appDb, storage);
    for (let i = 0; i < 10; i++) {
      const k = newKey(w.clientA);
      await putAged(dir, storage, k, 3);
      await dbRow(w.clientA, k, "PENDENTE");
    }
    const lone = newKey(w.clientA);
    await putAged(dir, storage, lone, 3);
    await expect(cleanupFiles(dbWithoutAvailable(appDb), storage, { maxAgeHours: 1, maxOrphanRatio: 1 })).rejects.toMatchObject({ code: "NO_AVAILABLE_ASSETS" });
    expect(await exists(dir, lone)).toBe(true);
    // controle: o banco real conhece arquivos DISPONIVEL, entao o mesmo cenario move o unico orfao
    expect(await cleanupFiles(appDb, storage, { maxAgeHours: 1, maxOrphanRatio: 1 })).toMatchObject({ orphanObjectsTrashed: 1 });
  });

  it("identificador da instalacao diferente entre banco e pasta aborta, mesmo com as flags de aceite; nada e tocado", async () => {
    const { dir, storage } = await freshRoot();
    await storage.writeInstallId(randomUUID()); // pasta de OUTRA instalacao
    const orphan = newKey(w.clientA);
    await putAged(dir, storage, orphan, 3);
    const stale = await ownerDb.asset.create({
      data: { clientId: w.clientA, storageKey: newKey(w.clientA), originalName: "p.png", uploadedById: w.ownerA.id, createdAt: new Date(Date.now() - 3 * HOUR) },
    });
    const err = await cleanupFiles(appDb, storage, { maxAgeHours: 1, maxOrphans: 1000, maxOrphanRatio: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(CleanupAbortedError);
    expect(err.code).toBe("INSTALL_ID_MISMATCH");
    expect(err.message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/); // nunca imprime os identificadores
    expect(await exists(dir, orphan)).toBe(true);
    expect((await ownerDb.asset.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("PENDENTE");
    // o vinculo explicito tambem NUNCA corrige uma divergencia
    await expect(bindInstallation(appDb, storage)).rejects.toMatchObject({ code: "INSTALL_ID_MISMATCH" });
  });

  it("pasta sem identificador: aborta e NAO cria nada em silencio; so o vinculo explicito cria (e nunca sobrescreve)", async () => {
    const { dir, storage } = await freshRoot();
    const orphan = newKey(w.clientA);
    await putAged(dir, storage, orphan, 3);
    await expect(cleanupFiles(appDb, storage, { maxAgeHours: 1 })).rejects.toMatchObject({ code: "INSTALL_ID_MISSING" });
    expect(await storage.readInstallId()).toBeNull();
    expect(await exists(dir, orphan)).toBe(true);
    expect(await bindInstallation(appDb, storage)).toBe("file-created");
    const id = await storage.readInstallId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await bindInstallation(appDb, storage)).toBe("ok");
    await expect(storage.writeInstallId(randomUUID())).rejects.toMatchObject({ status: 409 });
    expect(await storage.readInstallId()).toBe(id);
    expect(await cleanupFiles(appDb, storage, { maxAgeHours: 1 })).toMatchObject({ orphanObjectsTrashed: 1 });
  });

  it("opcoes invalidas (menos de 1 hora, retencao curta, teto negativo) sao recusadas antes de qualquer acesso", async () => {
    const { storage } = await freshRoot(); // sem identificador: se o servico olhasse o banco/pasta primeiro, o codigo seria outro
    for (const maxAgeHours of [0, 0.5, -1, Number.NaN]) {
      await expect(cleanupFiles(appDb, storage, { maxAgeHours }), String(maxAgeHours)).rejects.toMatchObject({ code: "INVALID_OPTIONS" });
    }
    await expect(cleanupFiles(appDb, storage, { trashRetentionDays: 0 })).rejects.toMatchObject({ code: "INVALID_OPTIONS" });
    await expect(cleanupFiles(appDb, storage, { maxOrphans: -1 })).rejects.toMatchObject({ code: "INVALID_OPTIONS" });
    await expect(cleanupFiles(appDb, storage, { maxOrphanRatio: 2 })).rejects.toMatchObject({ code: "INVALID_OPTIONS" });
  });

  it("orfao vai para a lixeira, e restauravel, e so e apagado depois da retencao; DISPONIVEL nunca e tocado", async () => {
    const { dir, storage } = await freshRoot();
    await bindInstallation(appDb, storage);
    const deps = depsFor(storage);
    const target = await requestUpload(appDb, ownerA, deps, { originalName: "fica.png", mimeType: "image/png", bytes: 500 });
    await receiveUpload(appDb, deps, { token: tokenOf(target.path), sessionUserId: w.ownerA.id, body: body(png(500)), contentLength: 500 });
    const kept = await ownerDb.asset.findUniqueOrThrow({ where: { id: target.assetId } });
    expect(kept.status).toBe("DISPONIVEL");
    const orphan = newKey(w.clientA);
    await putAged(dir, storage, orphan, 3, "dados-do-orfao");
    const t0 = new Date(Date.now() + 2 * HOUR); // hoje + 2 h: o objeto do DISPONIVEL tambem passa a ser "velho"

    const first = await cleanupFiles(appDb, storage, { now: t0, maxAgeHours: 1 });
    expect(first.orphanObjectsTrashed).toBe(1);
    expect(await exists(dir, orphan)).toBe(false);
    expect(await inTrash(dir, orphan)).toBe(true);
    expect(await exists(dir, kept.storageKey)).toBe(true); // DISPONIVEL intacto

    // restauravel: volta inteiro, no mesmo lugar; restaurar de novo nao ha o que fazer; restaurar sobre chave ocupada recusa
    expect(await storage.restoreFromTrash(orphan)).toBe(true);
    expect(await exists(dir, orphan)).toBe(true);
    expect(await fs.readFile(path.join(dir, orphan), "utf8")).toBe("dados-do-orfao");
    expect(await storage.restoreFromTrash(orphan)).toBe(false);

    // volta para a lixeira (de novo orfao) e a retencao decide: 29 dias nao apaga, 31 dias apaga de verdade
    const t1 = new Date(t0.getTime() + 2 * HOUR); // o objeto restaurado guarda a hora em que foi para a lixeira (t0)
    expect((await cleanupFiles(appDb, storage, { now: t1, maxAgeHours: 1 })).orphanObjectsTrashed).toBe(1);
    const t29 = new Date(t1.getTime() + 29 * 24 * HOUR);
    expect(await cleanupFiles(appDb, storage, { now: t29, maxAgeHours: 1 })).toMatchObject({ trashPurged: 0, orphanObjectsTrashed: 0 });
    expect(await inTrash(dir, orphan)).toBe(true);
    const t31 = new Date(t1.getTime() + 31 * 24 * HOUR);
    expect(await cleanupFiles(appDb, storage, { now: t31, maxAgeHours: 1 })).toMatchObject({ trashPurged: 1, orphanObjectsTrashed: 0 });
    expect(await inTrash(dir, orphan)).toBe(false);
    expect(await exists(dir, orphan)).toBe(false);
    expect(await storage.restoreFromTrash(orphan)).toBe(false);
    // o arquivo DISPONIVEL sobreviveu a tudo, inclusive a purga da lixeira 31 dias depois
    expect(await exists(dir, kept.storageKey)).toBe(true);
    expect((await ownerDb.asset.findUniqueOrThrow({ where: { id: kept.id } })).status).toBe("DISPONIVEL");
    // idempotente
    expect(await cleanupFiles(appDb, storage, { now: t31, maxAgeHours: 1 })).toEqual({ pendingExpired: 0, deletedObjectsRemoved: 0, orphanObjectsTrashed: 0, trashPurged: 0, tempRemoved: 0 });
  });

  it("restaurar sobre uma chave que ja existe recusa e nao sobrescreve", async () => {
    const { dir, storage } = await freshRoot();
    const key = newKey(w.clientA);
    await putAged(dir, storage, key, 1, "original");
    expect(await storage.moveToTrash(key, new Date())).toBe(true);
    await putAged(dir, storage, key, 1, "novo");
    await expect(storage.restoreFromTrash(key)).rejects.toMatchObject({ status: 409 });
    expect(await fs.readFile(path.join(dir, key), "utf8")).toBe("novo");
    expect(await storage.moveToTrash(newKey(w.clientA), new Date())).toBe(false);
  });
});

describe("M-B: pedidos paralelos, cota, teto global e espaco livre", () => {
  async function freshClientWithOwner(label: string) {
    const clientId = await makeClient(label);
    const owner = await makeUser("USER", `dono-${label}`);
    await addMember(clientId, owner.id, "CLIENT_OWNER");
    return { clientId, owner, ctx: await ctxFor(owner.id, clientId) };
  }

  it("20 pedidos paralelos da mesma pessoa nao passam do limite de pendentes", async () => {
    const { storage } = await freshRoot();
    const { ctx, clientId, owner } = await freshClientWithOwner("pend");
    const deps = depsFor(storage, { maxPendingPerUser: 5 });
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => requestUpload(appDb, ctx, deps, { originalName: "a.png", mimeType: "image/png", bytes: 100 })));
    const ok = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(5);
    expect(refused).toHaveLength(15);
    for (const r of refused) expect(r.reason).toMatchObject({ status: 429 });
    expect(await ownerDb.asset.count({ where: { clientId, uploadedById: owner.id, status: "PENDENTE" } })).toBe(5);
  });

  it("pedidos paralelos de PESSOAS diferentes do mesmo cliente nao passam da cota do cliente", async () => {
    const { storage } = await freshRoot();
    const { ctx, clientId } = await freshClientWithOwner("cota");
    const second = await makeUser("USER", "colab-cota");
    await addMember(clientId, second.id, "CLIENT_COLLABORATOR");
    const ctx2 = await ctxFor(second.id, clientId);
    const quota = 1_000_000;
    const deps = depsFor(storage, { clientQuotaBytes: quota });
    const results = await Promise.allSettled(
      Array.from({ length: 16 }, (_, i) => requestUpload(appDb, i % 2 ? ctx : ctx2, deps, { originalName: "q.png", mimeType: "image/png", bytes: 300_000 })),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(3); // 3 x 300 000 = 900 000; o quarto passaria de 1 000 000
    for (const r of results.filter((x): x is PromiseRejectedResult => x.status === "rejected")) expect(r.reason).toMatchObject({ status: 422, code: "STORAGE_QUOTA_EXCEEDED" });
    const sum = await ownerDb.asset.aggregate({ where: { clientId, status: "PENDENTE" }, _sum: { bytes: true } });
    expect(Number(sum._sum.bytes)).toBeLessThanOrEqual(quota);
  });

  it("a cota e do cliente INTEIRO: arquivo INTERNO da agencia e envio de outra pessoa contam, mesmo que a RLS esconda do cliente", async () => {
    const { storage } = await freshRoot();
    const { ctx, clientId } = await freshClientWithOwner("cota-total");
    const agency = await ctxFor(w.admin.id, clientId);
    const deps = depsFor(storage, { clientQuotaBytes: 1_000_000 });
    // a agencia reserva 800 000 bytes (INTERNO: o cliente nao enxerga essa linha)
    await requestUpload(appDb, agency, deps, { originalName: "interno.png", mimeType: "image/png", bytes: 800_000, visibility: "INTERNO" });
    // o cliente pediria 300 000: 1 100 000 > 1 000 000, mesmo sem ver o arquivo interno
    await expect(requestUpload(appDb, ctx, deps, { originalName: "c.png", mimeType: "image/png", bytes: 300_000 })).rejects.toMatchObject({ status: 422, code: "STORAGE_QUOTA_EXCEEDED" });
    await expect(requestUpload(appDb, ctx, deps, { originalName: "c.png", mimeType: "image/png", bytes: 150_000 })).resolves.toBeTruthy();
  });

  it("o PUT acima da cota (que diminuiu depois do pedido) e recusado ao finalizar: objeto apagado, registro REJEITADO", async () => {
    const { dir, storage } = await freshRoot();
    const { ctx, clientId, owner } = await freshClientWithOwner("put");
    const data = png(400_000);
    const requestDeps = depsFor(storage, { clientQuotaBytes: 1_000_000 });
    const target = await requestUpload(appDb, ctx, requestDeps, { originalName: "grande.png", mimeType: "image/png", bytes: data.length });
    const row = await ownerDb.asset.findUniqueOrThrow({ where: { id: target.assetId } });
    // a cota do cliente caiu para menos do que o arquivo antes de o envio terminar
    const lowered = depsFor(storage, { clientQuotaBytes: 100_000 });
    await expect(
      receiveUpload(appDb, lowered, { token: tokenOf(target.path), sessionUserId: owner.id, body: body(data), contentLength: data.length }),
    ).rejects.toMatchObject({ status: 422, code: "STORAGE_QUOTA_EXCEEDED" });
    expect((await ownerDb.asset.findUniqueOrThrow({ where: { id: target.assetId } })).status).toBe("REJEITADO");
    expect(await exists(dir, row.storageKey)).toBe(false);
    expect(await ownerDb.auditLog.count({ where: { clientId, action: "asset.rejected", entityId: target.assetId } })).toBe(1);
    // controle: dentro da cota o mesmo envio finaliza
    const t2 = await requestUpload(appDb, ctx, requestDeps, { originalName: "ok.png", mimeType: "image/png", bytes: data.length });
    const done = await receiveUpload(appDb, requestDeps, { token: tokenOf(t2.path), sessionUserId: owner.id, body: body(data), contentLength: data.length });
    expect(done.status).toBe("DISPONIVEL");
  });

  it("teto global: o pedido que passaria da soma de todos os clientes e recusado com 507, sem criar registro", async () => {
    const { storage } = await freshRoot();
    const { ctx, clientId } = await freshClientWithOwner("global");
    const used = await ownerDb.asset.aggregate({
      where: { OR: [{ status: "DISPONIVEL" }, { status: "PENDENTE", createdAt: { gte: new Date(Date.now() - 24 * HOUR) } }] },
      _sum: { bytes: true },
    });
    const ceiling = Number(used._sum.bytes ?? 0) + 1_000;
    const deps = depsFor(storage, { globalQuotaBytes: ceiling });
    await expect(requestUpload(appDb, ctx, deps, { originalName: "g.png", mimeType: "image/png", bytes: 5_000 })).rejects.toMatchObject({ status: 507, code: "STORAGE_FULL" });
    expect(await ownerDb.asset.count({ where: { clientId } })).toBe(0);
    // cabe dentro do teto
    await expect(requestUpload(appDb, ctx, deps, { originalName: "g.png", mimeType: "image/png", bytes: 500 })).resolves.toMatchObject({ method: "PUT" });
    // sem teto (0), nao ha recusa
    await expect(requestUpload(appDb, ctx, depsFor(storage), { originalName: "g.png", mimeType: "image/png", bytes: 5_000 })).resolves.toBeTruthy();
  });

  it("espaco livre insuficiente: recusa 507 no pedido e no PUT (o alvo continua valendo ate haver espaco)", async () => {
    const { dir, storage } = await freshRoot();
    const { ctx, owner } = await freshClientWithOwner("livre");
    const withFree = (free: () => number): ObjectStorage => ({ ...storage, freeBytes: async () => free() });
    let free = 10_000;
    const deps = depsFor(withFree(() => free), { minFreeBytes: 5_000 });
    // pedido: 8 000 bytes deixariam so 2 000 livres (< 5 000 minimos)
    await expect(requestUpload(appDb, ctx, deps, { originalName: "livre.png", mimeType: "image/png", bytes: 8_000 })).rejects.toMatchObject({ status: 507, code: "STORAGE_FULL" });
    // cabe: 4 000 deixam 6 000
    const data = png(4_000);
    const target = await requestUpload(appDb, ctx, deps, { originalName: "livre.png", mimeType: "image/png", bytes: data.length });
    // o disco encheu entre o pedido e o envio
    free = 6_000;
    await expect(receiveUpload(appDb, deps, { token: tokenOf(target.path), sessionUserId: owner.id, body: body(data), contentLength: data.length })).rejects.toMatchObject({ status: 507 });
    const row = await ownerDb.asset.findUniqueOrThrow({ where: { id: target.assetId } });
    expect(row.status).toBe("PENDENTE");
    expect(await exists(dir, row.storageKey)).toBe(false);
    // liberou espaco: o mesmo alvo funciona
    free = 20_000;
    const done = await receiveUpload(appDb, deps, { token: tokenOf(target.path), sessionUserId: owner.id, body: body(data), contentLength: data.length });
    expect(done.status).toBe("DISPONIVEL");
  });

  it("o driver de disco mede o espaco livre de verdade (statfs) e a lixeira nao conta como objeto", async () => {
    const { dir, storage } = await freshRoot();
    const free = await storage.freeBytes();
    expect(Number.isFinite(free)).toBe(true);
    expect(free).toBeGreaterThan(0);
    await putAged(dir, storage, newKey(w.clientA), 5);
    const seen: string[] = [];
    for await (const o of storage.list({ olderThanMs: 0 })) seen.push(o.key);
    expect(seen).toHaveLength(1);
    await storage.moveToTrash(seen[0], new Date());
    const after: string[] = [];
    for await (const o of storage.list({ olderThanMs: 0 })) after.push(o.key);
    expect(after).toEqual([]);
  });
});

describe("B-6 e quarentena: auditoria de edicao de roteiro e de emissao de link; download recusa QUARENTENA", () => {
  it("editar roteiro grava script.updated (autor, campos e numero de cenas, nunca o texto)", async () => {
    const admin = await ctxFor(w.admin.id, w.clientA);
    const script = await createScript(appDb, admin, { title: "Roteiro auditado" });
    await editScript(appDb, admin, script.id, { title: "Titulo novo", objective: "SEGREDO-DO-OBJETIVO" }, [{ dialogue: "FALA-SECRETA", durationSeconds: 5 }]);
    const logs = await ownerDb.auditLog.findMany({ where: { clientId: w.clientA, action: "script.updated", entityId: script.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(w.admin.id);
    expect(logs[0].diff).toEqual({ fields: ["objective", "title"], scenes: 1 });
    expect(JSON.stringify(logs[0])).not.toContain("SEGREDO-DO-OBJETIVO");
    expect(JSON.stringify(logs[0])).not.toContain("FALA-SECRETA");
  });

  it("emitir link de download grava asset.download_link_issued sem token nem chave; negar nao grava; arquivo em QUARENTENA e recusado (423) na emissao e na entrega", async () => {
    const { storage } = await freshRoot();
    await bindInstallation(appDb, storage);
    const deps = depsFor(storage);
    const data = png(800);
    const target = await requestUpload(appDb, ownerA, deps, { originalName: "arte-q.png", mimeType: "image/png", bytes: data.length });
    await receiveUpload(appDb, deps, { token: tokenOf(target.path), sessionUserId: w.ownerA.id, body: body(data), contentLength: data.length });

    const link = await requestDownload(appDb, ownerA, deps, target.assetId);
    const logs = await ownerDb.auditLog.findMany({ where: { clientId: w.clientA, action: "asset.download_link_issued", entityId: target.assetId } });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(w.ownerA.id);
    expect(logs[0].diff).toBeNull();
    expect(JSON.stringify(logs[0])).not.toContain(tokenOf(link.path));
    // outro cliente nao consegue emitir (404) e nada e gravado
    const ownerB = await ctxFor(w.ownerB.id, w.clientB);
    await expect(requestDownload(appDb, ownerB, deps, target.assetId)).rejects.toMatchObject({ status: 404 });
    expect(await ownerDb.auditLog.count({ where: { action: "asset.download_link_issued", entityId: target.assetId } })).toBe(1);

    // QUARENTENA: mesma pessoa, mesmo link ja emitido
    await sys((tx) => tx.asset.update({ where: { id: target.assetId }, data: { scanStatus: "QUARENTENA" } }));
    await expect(requestDownload(appDb, ownerA, deps, target.assetId)).rejects.toBeInstanceOf(AssetQuarantinedError);
    await expect(requestDownload(appDb, ownerA, deps, target.assetId)).rejects.toMatchObject({ status: 423, code: "ASSET_QUARANTINED" });
    await expect(deliverDownload(appDb, deps, { token: tokenOf(link.path), sessionUserId: w.ownerA.id })).rejects.toMatchObject({ status: 423 });
    expect(await ownerDb.auditLog.count({ where: { action: "asset.download_link_issued", entityId: target.assetId } })).toBe(1);
    // liberado, volta a baixar
    await sys((tx) => tx.asset.update({ where: { id: target.assetId }, data: { scanStatus: "LIMPO" } }));
    const again = await requestDownload(appDb, ownerA, deps, target.assetId);
    const file = await deliverDownload(appDb, deps, { token: tokenOf(again.path), sessionUserId: w.ownerA.id });
    await file.stream.cancel();
    expect(file.bytes).toBe(data.length);
  });
});
