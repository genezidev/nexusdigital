import { ExternalLink } from "@/components/app/external-link";
import { RecordingStatusBadge } from "@/components/app/status-badges";
import { DownloadButton } from "@/components/app/download-button";
import { MediaLinkList, type MediaLinkItem } from "@/components/fase2/media-links";
import type { Scope } from "@/lib/api/client";
import { formatDateTime } from "@/lib/formatting/date";
import { formatBytes, formatDay, formatDuration } from "@/lib/labels";
import type { ReactNode } from "react";

export interface ScriptData {
  title: string;
  objective: string | null;
  plannedDurationSeconds: number | null;
  deadlineOn: string | null;
  location: string | null;
  equipment: string | null;
  audioNotes: string | null;
  lightNotes: string | null;
  framingNotes: string | null;
  referenceLinks: unknown;
  scenes?: { id: string; position: number; dialogue: string | null; action: string | null; durationSeconds: number | null }[];
}

export interface RecordingData {
  id: string;
  kind: string;
  externalUrl: string | null;
  status: string;
  submittedAt: string;
  imageRightsConfirmedAt: string | null;
  feedback: string | null;
  reviewedAt: string | null;
  submittedBy: string;
  asset?: { id: string; originalName: string; bytes: number | null };
  /** Links de midia extras da gravacao (D-0025). */
  mediaLinks?: MediaLinkItem[];
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium whitespace-pre-wrap break-words">{children}</dd>
    </div>
  );
}

/** Instrucoes e cenas do roteiro (mesma leitura para agencia e cliente: so campos do DTO de cada lado). */
export function ScriptInstructions({ script, assigneeName }: { script: ScriptData; assigneeName?: string }) {
  const links = Array.isArray(script.referenceLinks) ? (script.referenceLinks as unknown[]).filter((l): l is string => typeof l === "string") : [];
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Item label="Objetivo">{script.objective ?? "N/D"}</Item>
        <Item label="Prazo da gravação">{formatDay(script.deadlineOn)}</Item>
        <Item label="Duração prevista">{formatDuration(script.plannedDurationSeconds)}</Item>
        <Item label="Local">{script.location ?? "N/D"}</Item>
        <Item label="Equipamento">{script.equipment ?? "N/D"}</Item>
        <Item label="Formato">Vertical 9:16</Item>
        {assigneeName ? <Item label="Responsável na equipe">{assigneeName}</Item> : null}
        <Item label="Áudio">{script.audioNotes ?? "N/D"}</Item>
        <Item label="Luz">{script.lightNotes ?? "N/D"}</Item>
        <Item label="Enquadramento">{script.framingNotes ?? "N/D"}</Item>
      </dl>
      {links.length > 0 ? (
        <div>
          <h3 className="mb-2 text-base font-semibold">Referências</h3>
          <ul className="flex flex-col gap-1">
            {links.map((l) => (
              <li key={l}>
                <ExternalLink href={l} label="Referência" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <h3 className="mb-2 text-base font-semibold">Cenas</h3>
        {script.scenes && script.scenes.length > 0 ? (
          <ol className="flex flex-col gap-3" aria-label="Cenas do roteiro">
            {script.scenes.map((s, i) => (
              <li key={s.id} className="rounded-lg border bg-background p-3">
                <p className="text-sm font-semibold">
                  Cena {i + 1} <span className="font-normal text-muted-foreground">({formatDuration(s.durationSeconds)})</span>
                </p>
                {s.dialogue ? (
                  <p className="mt-1 text-sm whitespace-pre-wrap">
                    <span className="font-medium">Fala: </span>
                    {s.dialogue}
                  </p>
                ) : null}
                {s.action ? (
                  <p className="mt-1 text-sm whitespace-pre-wrap">
                    <span className="font-medium">Ação: </span>
                    {s.action}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma cena cadastrada.</p>
        )}
      </div>
    </div>
  );
}

/** Historico de gravacoes (envios anteriores continuam visiveis). `actions` coloca os botoes de revisao da agencia. */
export function RecordingHistory({ recordings, scope, timeZone, actions }: { recordings: RecordingData[]; scope: Scope; timeZone: string; actions?: (r: RecordingData) => ReactNode }) {
  if (recordings.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma gravação enviada ainda.</p>;
  return (
    <ul className="flex flex-col gap-3" aria-label="Gravações enviadas">
      {recordings.map((r) => (
        <li key={r.id} className="rounded-lg border bg-background p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <RecordingStatusBadge status={r.status} />
            <span>
              enviada por {r.submittedBy} em {formatDateTime(r.submittedAt, timeZone)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {r.kind === "LINK" && r.externalUrl ? <ExternalLink href={r.externalUrl} label="Abrir gravação" /> : null}
            {r.asset ? (
              <>
                <span className="break-all">
                  {r.asset.originalName} ({formatBytes(r.asset.bytes)})
                </span>
                <DownloadButton scope={scope} assetId={r.asset.id} name={r.asset.originalName} />
              </>
            ) : null}
          </div>
          {r.mediaLinks && r.mediaLinks.length > 0 ? (
            <div className="mt-3">
              <MediaLinkList scope={scope} items={r.mediaLinks} />
            </div>
          ) : null}
          <p className="mt-2 text-muted-foreground">
            {r.imageRightsConfirmedAt ? `Autorização das pessoas confirmada em ${formatDateTime(r.imageRightsConfirmedAt, timeZone)}.` : "Autorização das pessoas não registrada."}
          </p>
          {r.feedback ? (
            <p className="mt-2 whitespace-pre-wrap">
              <span className="font-medium">Retorno da agência: </span>
              {r.feedback}
            </p>
          ) : null}
          {actions ? <div className="mt-3">{actions(r)}</div> : null}
        </li>
      ))}
    </ul>
  );
}
