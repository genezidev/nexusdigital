"use client";

import { Paperclip, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { DownloadButton } from "@/components/app/download-button";
import { FileUploader } from "@/components/app/file-uploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError, api, type Scope } from "@/lib/api/client";
import { ASSET_CATEGORY_LABEL, ASSET_ROLE_LABEL, formatBytes } from "@/lib/labels";
import type { UploadCategory, UploadLimits } from "@/lib/upload-rules";

export interface AttachmentItem {
  linkId: string;
  role: string;
  position: number;
  /** Numero da versao a que o arquivo pertence (quando e de versao). */
  versionNumber?: number;
  asset: { id: string; originalName: string; category: string | null; bytes: number | null; status: string };
}

/** Lista de arquivos (so DISPONIVEIS chegam aqui). Baixar e sempre por link assinado curto; remover so quando permitido. */
export function AttachmentList({ scope, items, removableClientId }: { scope: Scope; items: AttachmentItem[]; removableClientId?: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  async function remove(item: AttachmentItem) {
    if (!removableClientId) return;
    setBusyId(item.linkId);
    try {
      await api.detachLink(removableClientId, item.linkId);
      toast.success("Arquivo removido da versão.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível remover o arquivo.");
    } finally {
      setBusyId(null);
    }
  }
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Paperclip className="size-4" aria-hidden="true" /> Nenhum arquivo anexado.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="Arquivos">
      {items.map((item) => (
        <li key={item.linkId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3">
          <div className="min-w-0">
            <p className="font-medium break-all">{item.asset.originalName}</p>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">{ASSET_ROLE_LABEL[item.role] ?? item.role}</Badge>
              <span>{item.asset.category ? (ASSET_CATEGORY_LABEL[item.asset.category] ?? item.asset.category) : "N/D"}</span>
              <span>{formatBytes(item.asset.bytes)}</span>
              {item.versionNumber ? <span>Versão {item.versionNumber}</span> : null}
              {item.role === "PREVIA" ? <span>Posição {item.position + 1}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DownloadButton scope={scope} assetId={item.asset.id} name={item.asset.originalName} />
            {removableClientId ? (
              <Button variant="ghost" size="sm" disabled={busyId === item.linkId} onClick={() => void remove(item)} aria-label={`Remover ${item.asset.originalName} da versão`}>
                <Trash2 aria-hidden="true" /> Remover
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

const ROLE_OPTIONS = ["PREVIA", "FINAL", "REFERENCIA"] as const;

/** Envia um arquivo e o liga ao RASCUNHO da versao (a versao enviada e imutavel: a saida e criar nova versao). */
export function VersionAttachUploader({ clientId, versionId, limits, nextPosition }: { clientId: string; versionId: string; limits: UploadLimits; nextPosition: number }) {
  const router = useRouter();
  const id = useId();
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]>("PREVIA");
  const [position, setPosition] = useState(String(nextPosition + 1));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-role`}>Função do arquivo</Label>
          <NativeSelect id={`${id}-role`} value={role} onChange={(e) => setRole(e.target.value as (typeof ROLE_OPTIONS)[number])}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {ASSET_ROLE_LABEL[r]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-pos`}>Posição (ordem das páginas do carrossel)</Label>
          <Input id={`${id}-pos`} inputMode="numeric" value={position} onChange={(e) => setPosition(e.target.value)} />
        </div>
      </div>
      <FileUploader
        scope={{ kind: "admin", clientId }}
        limits={limits}
        visibility="COMPARTILHADO"
        label="Arquivo da versão"
        buttonLabel="Enviar e anexar à versão"
        onUploaded={async (asset) => {
          const pos = Math.max(0, Number.parseInt(position, 10) - 1 || 0);
          await api.attachAsset(clientId, asset.id, { role, position: pos, versionId });
          router.refresh();
        }}
      />
    </div>
  );
}

/** Envia o PDF do roteiro e o liga ao roteiro (so enquanto e rascunho). */
export function ScriptPdfUploader({ clientId, scriptId, limits }: { clientId: string; scriptId: string; limits: UploadLimits }) {
  const router = useRouter();
  const allowed: UploadCategory[] = ["DOCUMENTO"];
  return (
    <FileUploader
      scope={{ kind: "admin", clientId }}
      limits={limits}
      allowed={allowed}
      visibility="COMPARTILHADO"
      label="PDF do roteiro"
      help="Somente PDF."
      buttonLabel="Enviar e anexar o PDF"
      onUploaded={async (asset) => {
        await api.attachAsset(clientId, asset.id, { role: "PDF_ROTEIRO", scriptId });
        router.refresh();
      }}
    />
  );
}
