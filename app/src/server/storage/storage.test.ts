import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConflictError, PayloadTooLargeError, StorageUnavailableError } from "@/server/errors";
import { isExpired, signToken, signingSecret, verifyToken, type TokenClaims } from "@/server/storage/signed-token";
import { assertSafeStorageRoot, createLocalStorage } from "@/server/storage/local-disk";
import { newStorageKey } from "@/server/storage/keys";

let root: string;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "nexo-storage-unit-"));
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const streamOf = (chunks: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
  });
const client = () => randomUUID();
const keyFor = (c = client()) => newStorageKey(c);
const exists = (p: string) => fs.stat(p).then(() => true, () => false);
const tmpFiles = async () => (await fs.readdir(path.join(root, ".tmp")).catch(() => [])).length;

describe("driver de disco local", () => {
  it("grava em streaming, mede tamanho e SHA-256, guarda os primeiros bytes e publica na chave final", async () => {
    const storage = createLocalStorage(root);
    const key = keyFor();
    const data = Buffer.alloc(300_000, 7);
    data.write("%PDF-1.4", 0);
    const out = await storage.put(key, streamOf([data.subarray(0, 100_000), data.subarray(100_000)]), { maxBytes: 1_000_000 });
    expect(out.bytes).toBe(data.length);
    expect(out.checksumSha256).toBe(createHash("sha256").update(data).digest("hex"));
    expect(Buffer.from(out.head.subarray(0, 8)).toString()).toBe("%PDF-1.4");
    expect(out.head.length).toBe(4096);
    expect(await tmpFiles()).toBe(0);
    const opened = await storage.open(key);
    expect(opened?.bytes).toBe(data.length);
    const back = Buffer.from(await new Response(opened!.stream).arrayBuffer());
    expect(back.equals(data)).toBe(true);
    expect(await storage.open(keyFor())).toBeNull();
  });

  it("acima do limite: 413, sem objeto e sem temporario", async () => {
    const storage = createLocalStorage(root);
    const key = keyFor();
    await expect(storage.put(key, streamOf([Buffer.alloc(600), Buffer.alloc(600)]), { maxBytes: 1000 })).rejects.toBeInstanceOf(PayloadTooLargeError);
    expect(await storage.open(key)).toBeNull();
    expect(await tmpFiles()).toBe(0);
  });

  it("corpo interrompido no meio: apaga o temporario, nada fica publicado", async () => {
    const storage = createLocalStorage(root);
    const key = keyFor();
    let sent = false;
    const broken = new ReadableStream<Uint8Array>({
      pull(c) {
        if (!sent) {
          sent = true;
          c.enqueue(Buffer.alloc(5000, 1));
          return;
        }
        c.error(new Error("conexao caiu"));
      },
    });
    await expect(storage.put(key, broken, { maxBytes: 1_000_000 })).rejects.toThrow(/conexao caiu/);
    expect(await storage.open(key)).toBeNull();
    expect(await tmpFiles()).toBe(0);
  });

  it("nunca sobrescreve: segunda gravacao na mesma chave da 409 e o primeiro conteudo fica intacto", async () => {
    const storage = createLocalStorage(root);
    const key = keyFor();
    await storage.put(key, streamOf([Buffer.from("primeiro")]), { maxBytes: 100 });
    await expect(storage.put(key, streamOf([Buffer.from("segundo!")]), { maxBytes: 100 })).rejects.toBeInstanceOf(ConflictError);
    expect(await new Response((await storage.open(key))!.stream).text()).toBe("primeiro");
    expect(await tmpFiles()).toBe(0);
  });

  it("path traversal: so a chave clients/<uuid>/<uuid> vira caminho", async () => {
    const storage = createLocalStorage(root);
    const ok = randomUUID();
    const bad = [
      "../../etc/passwd",
      `clients/${ok}/../${ok}`,
      `clients/${ok}/${ok}/extra`,
      `/clients/${ok}/${ok}`,
      `clients\\${ok}\\${ok}`,
      `clients/${ok}/${ok}.png`,
      `clients/${ok.toUpperCase()}/${ok}`,
      `C:/Windows/win.ini`,
      `clients/..%2f/${ok}`,
      "",
      `clients/${ok}/${ok}\0`,
    ];
    for (const key of bad) {
      await expect(storage.put(key, streamOf([Buffer.from("x")]), { maxBytes: 10 }), key).rejects.toThrow();
      await expect(storage.open(key), key).rejects.toThrow();
      await expect(storage.delete(key), key).rejects.toThrow();
    }
    expect(await exists(path.join(root, "..", "etc"))).toBe(false);
  });

  it("a pasta nao pode ficar dentro de public/, src/, .next/ nem node_modules/ do app", () => {
    const app = path.join(os.tmpdir(), "app-falso");
    for (const dir of ["public", "public/uploads", "src/server", ".next/cache", "node_modules/x"]) {
      expect(() => assertSafeStorageRoot(path.join(app, dir), app), dir).toThrow(/nao pode ficar dentro/);
    }
    expect(assertSafeStorageRoot(path.join(app, "..", "armazenamento"), app)).toBe(path.resolve(app, "..", "armazenamento"));
  });

  it("delete e idempotente; list devolve so o que passou da idade", async () => {
    const storage = createLocalStorage(root);
    const key = keyFor();
    await storage.put(key, streamOf([Buffer.from("x")]), { maxBytes: 10 });
    const seen: string[] = [];
    for await (const o of storage.list({ olderThanMs: 24 * 3600_000 })) seen.push(o.key);
    expect(seen).not.toContain(key); // acabou de ser criado
    const later = new Date(Date.now() + 25 * 3600_000);
    const old: string[] = [];
    for await (const o of storage.list({ olderThanMs: 24 * 3600_000, now: later })) old.push(o.key);
    expect(old).toContain(key);
    await storage.delete(key);
    await storage.delete(key);
    expect(await storage.open(key)).toBeNull();
  });

  it("armazenamento indisponivel (pasta impossivel de criar): 503 claro, sem objeto e sem sucesso falso", async () => {
    const blocker = path.join(root, "arquivo-no-lugar-da-pasta");
    await fs.writeFile(blocker, "x");
    const broken = createLocalStorage(path.join(blocker, "dentro"));
    const key = keyFor();
    await expect(broken.put(key, streamOf([Buffer.from("x")]), { maxBytes: 10 })).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(broken.put(key, streamOf([Buffer.from("x")]), { maxBytes: 10 })).rejects.toMatchObject({ status: 503, code: "STORAGE_UNAVAILABLE" });
    expect(await broken.open(key)).toBeNull();
  });

  it("nao carrega o arquivo na memoria: 160 MB passam em pedacos de 1 MB sem inflar o processo", async () => {
    const storage = createLocalStorage(root);
    const key = keyFor();
    const chunk = Buffer.alloc(1024 * 1024, 3);
    let n = 0;
    const big = new ReadableStream<Uint8Array>({
      pull(c) {
        if (n++ >= 160) return c.close();
        c.enqueue(new Uint8Array(chunk));
      },
    });
    global.gc?.();
    const before = process.memoryUsage().rss;
    const out = await storage.put(key, big, { maxBytes: 200 * 1024 * 1024 });
    const growth = process.memoryUsage().rss - before;
    expect(out.bytes).toBe(160 * 1024 * 1024);
    expect(growth).toBeLessThan(110 * 1024 * 1024);
    await storage.delete(key);
  }, 60_000);
});

describe("token assinado (HMAC)", () => {
  const secret = signingSecret({ BETTER_AUTH_SECRET: "s".repeat(40) });
  const claims: TokenClaims = { purpose: "download", assetId: randomUUID(), clientId: randomUUID(), userId: randomUUID(), expiresAt: Math.floor(Date.now() / 1000) + 60 };

  it("ida e volta; vinculado a finalidade, arquivo, cliente e pessoa", () => {
    const token = signToken(secret, claims);
    expect(verifyToken(secret, token, "download")).toEqual({ ok: true, claims });
    expect(verifyToken(secret, token, "upload").ok).toBe(false); // token de download nao serve para envio
  });

  it("adulterado, truncado, de outro segredo ou malformado: recusado", () => {
    const token = signToken(secret, claims);
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ v: 1, p: "download", a: randomUUID(), c: claims.clientId, u: claims.userId, e: claims.expiresAt })).toString("base64url");
    const bad = [`${forged}.${sig}`, `${payload}.${sig.slice(0, -2)}AA`, `${payload}`, `${payload}.${sig}.x`, "", "a.b", "....", `${payload}.${"A".repeat(2000)}`];
    for (const t of bad) expect(verifyToken(secret, t, "download").ok, t.slice(0, 30)).toBe(false);
    const other = signingSecret({ BETTER_AUTH_SECRET: "x".repeat(40) });
    expect(verifyToken(other, token, "download")).toEqual({ ok: false, reason: "BAD_SIGNATURE" });
  });

  it("validade: confere pelo relogio informado (sem depender do relogio real)", () => {
    const at = (s: number) => new Date(s * 1000);
    expect(isExpired(claims, at(claims.expiresAt - 1))).toBe(false);
    expect(isExpired(claims, at(claims.expiresAt))).toBe(true);
    expect(isExpired(claims, at(claims.expiresAt + 3600))).toBe(true);
  });

  it("segredo: em producao e obrigatorio; fora dela deriva do BETTER_AUTH_SECRET", () => {
    expect(() => signingSecret({ BETTER_AUTH_SECRET: "s".repeat(40), NODE_ENV: "production" })).toThrow();
    expect(signingSecret({ BETTER_AUTH_SECRET: "s".repeat(40) }).length).toBe(32);
    expect(signingSecret({ BETTER_AUTH_SECRET: "s".repeat(40), STORAGE_SIGNING_SECRET: "k".repeat(32), NODE_ENV: "production" }).toString()).toBe("k".repeat(32));
  });
});
