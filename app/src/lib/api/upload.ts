import { z } from "zod";
import { ApiError, api, type Scope } from "@/lib/api/client";
import { declaredMimeType, uploadErrorMessage } from "@/lib/upload-rules";

// Envio de arquivo em DUAS etapas, como a spec 0002 (R-5) pede:
//  1. pede um alvo ao servidor (ele decide tipo e tamanho e devolve um caminho assinado de uso unico);
//  2. envia os bytes por PUT para esse caminho, com progresso e possibilidade de cancelar.
// XMLHttpRequest e usado so aqui, porque `fetch` ainda nao informa o progresso do ENVIO. Mesma origem, cookie de
// sessao HttpOnly, nenhum token em armazenamento do navegador, resposta validada com Zod.

const uploaded = z.object({
  id: z.string(),
  status: z.string(),
  bytes: z.number(),
  mimeType: z.string(),
  checksumSha256: z.string(),
  replayed: z.boolean(),
});
export type UploadedAsset = z.output<typeof uploaded>;

export class UploadCancelled extends Error {
  constructor() {
    super("Envio cancelado.");
    this.name = "UploadCancelled";
  }
}

export interface UploadHandle {
  promise: Promise<UploadedAsset>;
  cancel: () => void;
}

/** Envia os bytes para o alvo ja autorizado. Progresso de 0 a 100; queda de rede vira status 0. */
export function putBytes(path: string, file: Blob, onProgress: (percent: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<UploadedAsset>((resolve, reject) => {
    xhr.open("PUT", path);
    xhr.withCredentials = true;
    xhr.responseType = "text";
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(100, Math.floor((event.loaded / event.total) * 100)));
    };
    xhr.onerror = () => reject(new ApiError(0, "NETWORK", uploadErrorMessage(0)));
    xhr.ontimeout = () => reject(new ApiError(0, "NETWORK", uploadErrorMessage(0)));
    xhr.onabort = () => reject(new UploadCancelled());
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let payload: unknown;
        try {
          payload = JSON.parse(xhr.responseText);
        } catch {
          payload = undefined;
        }
        const parsed = uploaded.safeParse(payload);
        if (!parsed.success || parsed.data.status !== "DISPONIVEL") {
          reject(new ApiError(502, "BAD_RESPONSE", "O servidor respondeu em um formato inesperado. Tente novamente."));
          return;
        }
        onProgress(100);
        resolve(parsed.data);
        return;
      }
      reject(new ApiError(xhr.status, "UPLOAD_FAILED", uploadErrorMessage(xhr.status)));
    };
    xhr.send(file);
  });
  return { promise, cancel: () => xhr.abort() };
}

export interface UploadOptions {
  scope: Scope;
  visibility?: "INTERNO" | "COMPARTILHADO";
  onProgress: (percent: number) => void;
}

/** Pedido de alvo + envio dos bytes. Cancelar antes do alvo chegar tambem funciona (o envio nem comeca). */
export function uploadFile(file: File, options: UploadOptions): UploadHandle {
  let cancelled = false;
  let inner: UploadHandle | null = null;
  const promise = (async () => {
    const target = await api.initUpload(options.scope, {
      originalName: file.name,
      mimeType: declaredMimeType(file),
      bytes: file.size,
      visibility: options.visibility,
    });
    if (cancelled) throw new UploadCancelled();
    inner = putBytes(target.path, file, options.onProgress);
    return inner.promise;
  })();
  return {
    promise,
    cancel: () => {
      cancelled = true;
      inner?.cancel();
    },
  };
}

/** Pede o link assinado (curto, de uso por pessoa) e baixa como anexo; nunca ha URL publica do arquivo. */
export async function downloadAsset(scope: Scope, assetId: string): Promise<void> {
  const link = await api.downloadLink(scope, assetId);
  const a = document.createElement("a");
  a.href = link.path;
  a.rel = "noopener";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
