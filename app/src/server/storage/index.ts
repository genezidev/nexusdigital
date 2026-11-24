import { getServerEnv } from "@/server/config/env";
import { StorageUnavailableError } from "@/server/errors";
import { createLocalStorage } from "@/server/storage/local-disk";
import type { ObjectStorage } from "@/server/storage/types";

let cache: { dir: string; storage: ObjectStorage } | undefined;

/**
 * Motor de armazenamento configurado. Sem STORAGE_LOCAL_DIR (ou com pasta recusada) o envio e o download
 * respondem 503 com mensagem generica: nunca sucesso falso.
 */
export function getStorage(): ObjectStorage {
  const dir = getServerEnv().STORAGE_LOCAL_DIR;
  if (!dir) {
    console.error("[nexo] armazenamento: STORAGE_LOCAL_DIR nao configurado");
    throw new StorageUnavailableError();
  }
  if (cache?.dir === dir) return cache.storage;
  try {
    const storage = createLocalStorage(dir);
    cache = { dir, storage };
    return storage;
  } catch {
    console.error("[nexo] armazenamento: STORAGE_LOCAL_DIR recusada");
    throw new StorageUnavailableError();
  }
}
