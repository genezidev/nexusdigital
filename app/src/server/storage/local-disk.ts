import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { HEAD_BYTES } from "@/server/domain/file-type";
import { ConflictError, PayloadTooLargeError, StorageUnavailableError } from "@/server/errors";
import type { ListedObject, ObjectStorage, OpenedObject, StoredObject } from "@/server/storage/types";

// Driver de DISCO LOCAL (dev e teste; producao pequena em VPS so se o dono decidir, ver D-0015).
// - Pasta configuravel (STORAGE_LOCAL_DIR), recusada se estiver dentro de public/, src/ ou .next/ do app.
// - Chave aleatoria `clients/<cliente>/<uuid>` validada por regex estrita: nome do usuario nunca vira caminho,
//   entao nao existe path traversal (nem "..", nem barra, nem unidade do Windows, nem nome reservado).
// - Escreve em .tmp/<uuid>.part (modo 0600, flag wx), confere tamanho e calcula SHA-256 em streaming, fsync e
//   publica por link (falha se a chave ja existe) + remove o temporario. Diretorios 0700, arquivos 0600.

const HEX = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const OBJECT_KEY = new RegExp(`^clients/(${HEX})/(${HEX})$`);
const TEMP_KEY = new RegExp(`^\\.tmp/(${HEX})\\.part$`);

const errCode = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "");

function toUnavailable(op: string, error: unknown): never {
  console.error(`[nexo] armazenamento: falha em ${op} codigo=${errCode(error) || "?"}`);
  throw new StorageUnavailableError();
}

/** A pasta do storage nunca pode ficar onde o Next serve arquivos (public/) nem dentro do codigo compilado. */
export function assertSafeStorageRoot(root: string, appDir: string = process.cwd()): string {
  const resolved = path.resolve(root);
  for (const forbidden of ["public", "src", ".next", "node_modules"]) {
    const dir = path.resolve(appDir, forbidden);
    const rel = path.relative(dir, resolved);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
      throw new Error(`STORAGE_LOCAL_DIR nao pode ficar dentro de ${forbidden}/`);
    }
  }
  return resolved;
}

export function createLocalStorage(rootDir: string, appDir: string = process.cwd()): ObjectStorage {
  const root = assertSafeStorageRoot(rootDir, appDir);
  const tmpDir = path.join(root, ".tmp");
  const trashDir = path.join(root, ".trash");
  const installIdPath = path.join(root, ".install-id");
  const trashPath = (key: string) => {
    const m = OBJECT_KEY.exec(key);
    if (!m) throw new Error("chave de objeto invalida");
    return path.join(trashDir, "clients", m[1], m[2]);
  };

  function objectPath(key: string): string {
    const m = OBJECT_KEY.exec(key);
    if (!m) throw new Error("chave de objeto invalida");
    const full = path.join(root, "clients", m[1], m[2]);
    // Defesa em profundidade: mesmo com a regex, o caminho final precisa ficar dentro da raiz.
    if (!full.startsWith(root + path.sep)) throw new Error("chave fora da raiz");
    return full;
  }

  const ensureDir = (dir: string) => fs.mkdir(dir, { recursive: true, mode: 0o700 });

  return {
    driver: "local",

    async put(key, source, opts): Promise<StoredObject> {
      const finalPath = objectPath(key);
      const tmpPath = path.join(tmpDir, `${randomUUID()}.part`);
      const reader = source.getReader();
      let handle: fs.FileHandle | undefined;
      let published = false;
      try {
        try {
          await ensureDir(tmpDir);
          handle = await fs.open(tmpPath, "wx", 0o600);
        } catch (e) {
          toUnavailable("abrir temporario", e);
        }
        const hash = createHash("sha256");
        const head = Buffer.alloc(HEAD_BYTES);
        let headLen = 0;
        let total = 0;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value || value.byteLength === 0) continue;
          total += value.byteLength;
          if (total > opts.maxBytes) throw new PayloadTooLargeError();
          hash.update(value);
          if (headLen < HEAD_BYTES) {
            headLen += Buffer.from(value.buffer, value.byteOffset, value.byteLength).copy(head, headLen, 0, HEAD_BYTES - headLen);
          }
          let offset = 0;
          while (offset < value.byteLength) {
            try {
              const { bytesWritten } = await handle!.write(value, offset, value.byteLength - offset);
              offset += bytesWritten;
            } catch (e) {
              toUnavailable("gravar", e);
            }
          }
        }
        try {
          await handle!.sync();
          await handle!.close();
          handle = undefined;
          await ensureDir(path.dirname(finalPath));
        } catch (e) {
          toUnavailable("finalizar", e);
        }
        try {
          // link falha com EEXIST se a chave ja existe: duas gravacoes simultaneas nunca se sobrescrevem.
          await fs.link(tmpPath, finalPath);
        } catch (e) {
          const code = errCode(e);
          if (code === "EEXIST") throw new ConflictError("OBJECT_EXISTS", "Ja existe um arquivo gravado para este envio.");
          if (code === "EPERM" || code === "ENOSYS" || code === "EXDEV") {
            // Sistema de arquivos sem hard link: rename com conferencia previa (a chave e aleatoria, a corrida e remota).
            if (await fs.stat(finalPath).then(() => true, () => false)) throw new ConflictError("OBJECT_EXISTS", "Ja existe um arquivo gravado para este envio.");
            await fs.rename(tmpPath, finalPath).catch((err) => toUnavailable("publicar", err));
          } else toUnavailable("publicar", e);
        }
        published = true;
        await fs.rm(tmpPath, { force: true });
        return { bytes: total, checksumSha256: hash.digest("hex"), head: new Uint8Array(head.subarray(0, headLen)) };
      } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
      } finally {
        await handle?.close().catch(() => undefined);
        if (!published) await fs.rm(tmpPath, { force: true }).catch(() => undefined);
      }
    },

    async open(key): Promise<OpenedObject | null> {
      const full = objectPath(key);
      let st;
      try {
        st = await fs.stat(full);
      } catch (e) {
        if (errCode(e) === "ENOENT") return null;
        toUnavailable("abrir", e);
      }
      if (!st.isFile()) return null;
      return { stream: Readable.toWeb(createReadStream(full)) as unknown as ReadableStream<Uint8Array>, bytes: st.size };
    },

    async delete(key): Promise<void> {
      const full = TEMP_KEY.test(key) ? path.join(root, key) : objectPath(key);
      try {
        await fs.rm(full, { force: true });
      } catch (e) {
        toUnavailable("apagar", e);
      }
    },

    async *list(opts): AsyncIterable<ListedObject> {
      const cutoff = opts.olderThanMs <= 0 ? Number.POSITIVE_INFINITY : (opts.now ?? new Date()).getTime() - opts.olderThanMs;
      const readdir = (dir: string) => fs.readdir(dir, { withFileTypes: true }).catch((e) => (errCode(e) === "ENOENT" ? [] : toUnavailable("listar", e)));
      for (const t of await readdir(tmpDir)) {
        const key = `.tmp/${t.name}`;
        if (!t.isFile() || !TEMP_KEY.test(key)) continue;
        const st = await fs.stat(path.join(tmpDir, t.name)).catch(() => null);
        if (st && st.mtimeMs < cutoff) yield { key, modifiedAt: st.mtime };
      }
      for (const c of await readdir(path.join(root, "clients"))) {
        if (!c.isDirectory()) continue;
        for (const f of await readdir(path.join(root, "clients", c.name))) {
          const key = `clients/${c.name}/${f.name}`;
          if (!f.isFile() || !OBJECT_KEY.test(key)) continue;
          const st = await fs.stat(path.join(root, "clients", c.name, f.name)).catch(() => null);
          if (st && st.mtimeMs < cutoff) yield { key, modifiedAt: st.mtime };
        }
      }
    },

    async readInstallId(): Promise<string | null> {
      try {
        const text = (await fs.readFile(installIdPath, "utf8")).trim();
        return text.length > 0 && text.length <= 200 ? text : null;
      } catch (e) {
        if (errCode(e) === "ENOENT") return null;
        toUnavailable("ler identificador da instalacao", e);
      }
    },

    async writeInstallId(id): Promise<void> {
      if (!/^[A-Za-z0-9-]{8,200}$/.test(id)) throw new Error("identificador de instalacao invalido");
      try {
        await ensureDir(root);
        await fs.writeFile(installIdPath, id + "\n", { flag: "wx", mode: 0o600 });
      } catch (e) {
        if (errCode(e) === "EEXIST") throw new ConflictError("INSTALL_ID_EXISTS", "A pasta de armazenamento ja tem um identificador de instalacao.");
        toUnavailable("gravar identificador da instalacao", e);
      }
    },

    async moveToTrash(key, now): Promise<boolean> {
      const src = objectPath(key);
      const dest = trashPath(key);
      try {
        if (!(await fs.stat(src).then((st) => st.isFile(), () => false))) return false;
        await ensureDir(path.dirname(dest));
        await fs.rm(dest, { force: true });
        await fs.rename(src, dest);
        await fs.utimes(dest, now, now);
        return true;
      } catch (e) {
        toUnavailable("mover para a lixeira", e);
      }
    },

    async restoreFromTrash(key): Promise<boolean> {
      const src = trashPath(key);
      const dest = objectPath(key);
      if (!(await fs.stat(src).then((st) => st.isFile(), () => false))) return false;
      if (await fs.stat(dest).then(() => true, () => false)) throw new ConflictError("OBJECT_EXISTS", "Ja existe um arquivo gravado nesta chave.");
      try {
        await ensureDir(path.dirname(dest));
        await fs.rename(src, dest);
        return true;
      } catch (e) {
        toUnavailable("restaurar da lixeira", e);
      }
    },

    async *listTrash(): AsyncIterable<{ key: string; trashedAt: Date }> {
      const readdir = (dir: string) => fs.readdir(dir, { withFileTypes: true }).catch((e) => (errCode(e) === "ENOENT" ? [] : toUnavailable("listar lixeira", e)));
      for (const c of await readdir(path.join(trashDir, "clients"))) {
        if (!c.isDirectory()) continue;
        for (const f of await readdir(path.join(trashDir, "clients", c.name))) {
          const key = `clients/${c.name}/${f.name}`;
          if (!f.isFile() || !OBJECT_KEY.test(key)) continue;
          const st = await fs.stat(path.join(trashDir, "clients", c.name, f.name)).catch(() => null);
          if (st) yield { key, trashedAt: st.mtime };
        }
      }
    },

    async deleteFromTrash(key): Promise<void> {
      try {
        await fs.rm(trashPath(key), { force: true });
      } catch (e) {
        toUnavailable("apagar da lixeira", e);
      }
    },

    async freeBytes(): Promise<number> {
      try {
        await ensureDir(root);
        const st = await fs.statfs(root);
        return Number(st.bavail) * Number(st.bsize);
      } catch (e) {
        toUnavailable("medir espaco livre", e);
      }
    },
  };
}
