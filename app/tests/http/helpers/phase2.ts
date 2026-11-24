import "dotenv/config";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { signToken, type TokenClaims } from "@/server/storage/signed-token";
import { addMember, makeUser, makeWorld, ownerDb, type World } from "../../integration/helpers/world";
import { makeCollaboratorWithApproval, makePhase2, makeStaffAssigned, type Phase2Data } from "../../integration/helpers/phase2";
import { BASE, err, http as call, login, type Res } from "./http";

// Mundo da fase 2 por HTTP: dois clientes com todas as tabelas novas preenchidas (marcas plantadas), pessoas de cada
// papel e cookies de sessao de verdade. As rotas sao as do app COMPILADO.

export interface Phase2World {
  w: World;
  a: Phase2Data;
  b: Phase2Data;
  collabApprover: { id: string; email: string };
  staffPlain: { id: string; email: string };
  cookie: { admin: string; ownerA: string; collabA: string; collabApprover: string; ownerB: string; staffA: string; staffFree: string };
}

export async function makePhase2World(): Promise<Phase2World> {
  const w = await makeWorld();
  const a = await makePhase2(w.clientA, w.admin.id, w.ownerA.id);
  const b = await makePhase2(w.clientB, w.admin.id, w.ownerB.id);
  const collabApprover = await makeCollaboratorWithApproval(w.clientA);
  const staffPlain = await makeStaffAssigned(w.clientA, "staff-b2");
  const cookie = {
    admin: await login(w.admin.email),
    ownerA: await login(w.ownerA.email),
    collabA: await login(w.collabA.email),
    collabApprover: await login(collabApprover.email),
    ownerB: await login(w.ownerB.email),
    staffA: await login(w.staffAssignedA.email),
    staffFree: await login(w.staffUnassigned.email),
  };
  return { w, a, b, collabApprover, staffPlain, cookie };
}

export { makeUser, addMember, ownerDb };

// ---------- armazenamento de teste: o mesmo calculo de scripts/iniciar-app-teste.mjs ----------

export const STORAGE_DIR = path.resolve(__dirname, "../../../../.storage-local/test");
export const MB = 1024 * 1024;
export const LIMITS = { image: 1 * MB, pdf: 2 * MB, video: 16 * MB };

export function testSecret(): Buffer {
  return Buffer.from(createHash("sha256").update(`teste-armazenamento:${process.env.BETTER_AUTH_SECRET ?? ""}`).digest("hex"), "utf8");
}

export function forgeToken(claims: TokenClaims): string {
  return signToken(testSecret(), claims);
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Arquivos gravados no disco de teste (so as chaves clients/<cliente>/<uuid>). */
export async function listStoredKeys(): Promise<string[]> {
  const out: string[] = [];
  const clients = await fs.readdir(path.join(STORAGE_DIR, "clients")).catch(() => []);
  for (const c of clients) for (const f of await fs.readdir(path.join(STORAGE_DIR, "clients", c)).catch(() => [])) out.push(`clients/${c}/${f}`);
  return out;
}

export async function storedBytes(storageKey: string): Promise<Buffer | null> {
  return fs.readFile(path.join(STORAGE_DIR, storageKey)).catch(() => null);
}

// ---------- bytes de arquivos de teste (assinaturas reais, conteudo fictício) ----------

export function png(size: number): Buffer {
  const b = Buffer.alloc(size, 9);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  return b;
}
export const jpeg = (size: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size - 4, 5)]);
export const pdf = (size: number) => Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(size - 9, 32)]);
export const mp4 = (size: number) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(size - 12, 0)]);

// ---------- chamadas ----------

const ORIGIN = BASE;

export function api(cookie: string, base = BASE) {
  const go = (method: string) => (p: string, body?: unknown) => call(p, { method, cookie, body, base });
  return { get: go("GET"), post: go("POST"), put: go("PUT"), patch: go("PATCH"), del: go("DELETE") };
}

export interface UploadOk {
  assetId: string;
  path: string;
  expiresAt: string;
  maxBytes: number;
}

/** Pede o alvo e envia os bytes. `initPath` e a rota de pedido (admin ou portal). */
export async function uploadVia(
  cookie: string,
  initPath: string,
  meta: { originalName: string; mimeType: string; bytes: number; visibility?: "INTERNO" | "COMPARTILHADO" },
  data: Uint8Array,
  opts: { base?: string } = {},
): Promise<{ init: Res; put: Res | null; assetId?: string }> {
  const base = opts.base ?? BASE;
  const init = await call(initPath, { method: "POST", cookie, body: meta, base });
  if (init.status !== 201) return { init, put: null };
  const target = init.json as UploadOk;
  const put = await call(target.path, { method: "PUT", cookie, rawBody: data, contentType: "application/octet-stream", base });
  return { init, put, assetId: target.assetId };
}

/** PUT cru por socket, para simular conexao que cai no meio do corpo (fetch nao deixa). */
export function interruptedPut(cookie: string, urlPath: string, declared: number, partial: Buffer): Promise<void> {
  return new Promise((resolve) => {
    const u = new URL(BASE);
    const req = http.request(
      { host: u.hostname, port: u.port, path: urlPath, method: "PUT", headers: { cookie, origin: ORIGIN, "content-type": "application/octet-stream", "content-length": String(declared), "x-real-ip": "10.99.1.1" } },
      () => resolve(),
    );
    req.on("error", () => resolve());
    req.on("close", () => resolve());
    req.write(partial, () => setTimeout(() => req.destroy(), 150));
  });
}

export const code = (r: Res) => err(r)?.code;
export type { Res };
export { makePhase2, BASE };
