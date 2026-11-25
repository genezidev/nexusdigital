"use client";

import { FileUp, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ApiError, type Scope } from "@/lib/api/client";
import { UploadCancelled, uploadFile, type UploadHandle, type UploadedAsset } from "@/lib/api/upload";
import { formatBytes } from "@/lib/labels";
import { ACCEPT_BY_CATEGORY, FILE_TYPE_HELP, formatLimit, validateFileBeforeUpload, type UploadCategory, type UploadLimits } from "@/lib/upload-rules";

type Phase = "idle" | "ready" | "uploading";

/**
 * Seletor de arquivo com validacao PREVIA (tipo e tamanho; a decisao final e do servidor), barra de progresso,
 * cancelamento e mensagens em pt-BR para queda de conexao, 413, 415, 429 e 503. O envio e em duas etapas
 * (pedido de alvo + PUT); nada de URL publica. Depois de enviado, `onUploaded` decide o que fazer com o arquivo.
 */
export function FileUploader({
  scope,
  limits,
  allowed = ["IMAGEM", "DOCUMENTO", "VIDEO"],
  visibility,
  label = "Arquivo",
  help,
  buttonLabel = "Enviar arquivo",
  onUploaded,
}: {
  scope: Scope;
  limits: UploadLimits;
  allowed?: readonly UploadCategory[];
  visibility?: "INTERNO" | "COMPARTILHADO";
  label?: string;
  help?: string;
  buttonLabel?: string;
  onUploaded: (asset: UploadedAsset, file: File) => Promise<void> | void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<UploadHandle | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Sair da tela no meio do envio cancela o envio (nada fica meio salvo: o servidor so marca DISPONIVEL se chegar inteiro).
  useEffect(() => () => handleRef.current?.cancel(), []);

  const accept = allowed.map((c) => ACCEPT_BY_CATEGORY[c]).join(",");
  const limitText = allowed.map((c) => `${c === "IMAGEM" ? "imagem" : c === "VIDEO" ? "vídeo" : "PDF"} até ${formatLimit(limits[c])}`).join("; ");

  function onPick(next: File | undefined) {
    setError(null);
    setPercent(0);
    if (!next) {
      setFile(null);
      setPhase("idle");
      return;
    }
    const problem = validateFileBeforeUpload(next, limits, allowed);
    if (problem) {
      setFile(null);
      setPhase("idle");
      setError(problem);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFile(next);
    setPhase("ready");
  }

  async function send() {
    if (!file) return;
    setError(null);
    setPercent(0);
    setPhase("uploading");
    const handle = uploadFile(file, { scope, visibility, onProgress: setPercent });
    handleRef.current = handle;
    try {
      const asset = await handle.promise;
      await onUploaded(asset, file);
      toast.success("Arquivo enviado.");
      setFile(null);
      setPhase("idle");
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      if (e instanceof UploadCancelled) {
        setPhase("ready");
        setPercent(0);
        toast.info("Envio cancelado.");
      } else {
        setPhase("ready");
        setError(e instanceof ApiError ? e.message : "Não foi possível concluir o envio. Tente novamente.");
      }
    } finally {
      handleRef.current = null;
    }
  }

  const busy = phase === "uploading";
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background p-4" data-testid="file-uploader">
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>{label}</Label>
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={accept}
          disabled={busy}
          aria-describedby={`${id}-help`}
          onChange={(e) => onPick(e.target.files?.[0])}
          className="block h-11 w-full min-w-0 cursor-pointer rounded-md border border-input bg-transparent px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-sm file:font-medium file:text-secondary-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
        />
        <p id={`${id}-help`} className="text-sm text-muted-foreground">
          {help ?? FILE_TYPE_HELP} Limites: {limitText}. O servidor confere o conteúdo real do arquivo.
        </p>
      </div>
      <FormError message={error} />
      {file ? (
        <p className="text-sm" data-testid="uploader-file">
          <span className="font-medium break-all">{file.name}</span> <span className="text-muted-foreground">({formatBytes(file.size)})</span>
        </p>
      ) : null}
      {busy ? (
        <div className="flex flex-col gap-2" aria-live="polite">
          <ProgressBar value={percent} label="Progresso do envio" />
          <p className="text-sm text-muted-foreground">Enviando… {percent}%</p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void send()} disabled={!file || busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileUp aria-hidden="true" />}
          {busy ? "Enviando…" : buttonLabel}
        </Button>
        {busy ? (
          <Button type="button" variant="outline" onClick={() => handleRef.current?.cancel()}>
            <X aria-hidden="true" /> Cancelar envio
          </Button>
        ) : null}
      </div>
    </div>
  );
}
