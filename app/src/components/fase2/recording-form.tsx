"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { FileUploader } from "@/components/app/file-uploader";
import { FormError } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api, type Scope } from "@/lib/api/client";
import { formatBytes } from "@/lib/labels";
import type { UploadLimits } from "@/lib/upload-rules";

/**
 * Envio da gravacao: por arquivo (video) OU por link HTTPS de servico autorizado. Subir o arquivo NAO avisa a agencia:
 * so "Marcar como enviada" cria a gravacao. Antes, o cliente confirma a autorizacao das pessoas que aparecem.
 */
export function RecordingForm({ scope, scriptId, limits, domains, uploadsEnabled = true }: { scope: Scope; scriptId: string; limits: UploadLimits; domains: string[]; uploadsEnabled?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [asset, setAsset] = useState<{ id: string; name: string; bytes: number } | null>(null);
  const [url, setUrl] = useState("");
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSource = !!asset !== !!url.trim();

  async function submit() {
    setError(null);
    if (!rights) return setError("Confirme que você tem autorização das pessoas que aparecem na gravação.");
    if (!!asset === !!url.trim()) return setError("Envie um arquivo OU cole um link, não os dois.");
    setBusy(true);
    try {
      await api.submitRecording(scope, scriptId, { assetId: asset?.id, url: asset ? undefined : url.trim(), imageRightsConfirmed: true });
      toast.success("Gravação marcada como enviada. A agência vai conferir.");
      setAsset(null);
      setUrl("");
      setRights(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível marcar a gravação como enviada.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="recording-form">
      {uploadsEnabled ? (
        <FileUploader
          scope={scope}
          limits={limits}
          allowed={["VIDEO"]}
          visibility="COMPARTILHADO"
          label="Arquivo de vídeo da gravação"
          help="Vídeos MP4, MOV ou WebM."
          buttonLabel="Enviar vídeo"
          onUploaded={(a, file) => setAsset({ id: a.id, name: file.name, bytes: a.bytes })}
        />
      ) : null}
      {asset ? (
        <p className="text-sm" role="status">
          Arquivo pronto: <span className="font-medium break-all">{asset.name}</span> ({formatBytes(asset.bytes)}). Falta marcar como enviada.
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-url`}>{uploadsEnabled ? "Ou cole o link da gravação" : "Cole o link da gravação"}</Label>
        <Input id={`${id}-url`} type="url" inputMode="url" autoComplete="off" value={url} disabled={!!asset} onChange={(e) => setUrl(e.target.value)} aria-describedby={`${id}-hint`} />
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          Só links https:// de {domains.length ? domains.join(", ") : "serviços autorizados"}. O sistema não abre nem baixa o link. Deixe o arquivo com acesso “qualquer pessoa com o link” para a agência conseguir abrir.
        </p>
      </div>
      <div className="flex items-start gap-3">
        <input id={`${id}-rights`} type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={rights} onChange={(e) => setRights(e.target.checked)} />
        <label htmlFor={`${id}-rights`} className="text-sm">
          Tenho autorização das pessoas que aparecem na gravação.
        </label>
      </div>
      <FormError message={error} />
      <div>
        <Button onClick={() => void submit()} disabled={busy || !hasSource}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
          Marcar gravação como enviada
        </Button>
      </div>
    </div>
  );
}
