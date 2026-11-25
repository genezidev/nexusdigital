import { Clock, EyeOff, Share2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  CONTENT_STATUS_CLIENT_LABEL,
  CONTENT_STATUS_LABEL,
  CYCLE_STATUS_LABEL,
  RECORDING_STATUS_LABEL,
  SCRIPT_STATUS_CLIENT_LABEL,
  SCRIPT_STATUS_LABEL,
  SUBSCRIPTION_STATUS_LABEL,
} from "@/lib/labels";

// Todo estado aparece com TEXTO (nunca so cor). A variante so reforca o significado.
type Variant = "default" | "secondary" | "destructive" | "success" | "warning" | "outline";

const CONTENT_VARIANT: Record<string, Variant> = {
  PLANEJADO: "outline",
  EM_PRODUCAO: "secondary",
  AGUARDANDO_APROVACAO: "warning",
  EM_REVISAO: "warning",
  APROVADO: "success",
  AGENDADO: "success",
  PUBLICADO: "success",
  ANALISADO: "success",
  CANCELADO: "secondary",
};

export function ContentStatusBadge({ status, audience = "agency" }: { status: string; audience?: "agency" | "client" }) {
  const labels = audience === "client" ? CONTENT_STATUS_CLIENT_LABEL : CONTENT_STATUS_LABEL;
  return <Badge variant={CONTENT_VARIANT[status] ?? "secondary"}>{labels[status] ?? status}</Badge>;
}

const SCRIPT_VARIANT: Record<string, Variant> = {
  RASCUNHO: "outline",
  ENVIADO: "secondary",
  AGUARDANDO_GRAVACAO: "warning",
  GRAVACAO_RECEBIDA: "success",
  EM_EDICAO: "secondary",
  AGUARDANDO_APROVACAO: "warning",
  FINALIZADO: "success",
  PUBLICADO: "success",
};

export function ScriptStatusBadge({ status, audience = "agency" }: { status: string; audience?: "agency" | "client" }) {
  const labels = audience === "client" ? SCRIPT_STATUS_CLIENT_LABEL : SCRIPT_STATUS_LABEL;
  return <Badge variant={SCRIPT_VARIANT[status] ?? "secondary"}>{labels[status] ?? status}</Badge>;
}

export function RecordingStatusBadge({ status }: { status: string }) {
  const variant: Variant = status === "RECEBIDA" ? "success" : status === "REGRAVACAO_SOLICITADA" ? "warning" : "secondary";
  return <Badge variant={variant}>{RECORDING_STATUS_LABEL[status] ?? status}</Badge>;
}

export function VisibilityBadge({ visibility }: { visibility: string }) {
  return visibility === "COMPARTILHADO" ? (
    <Badge variant="secondary">
      <Share2 aria-hidden="true" /> Compartilhado com o cliente
    </Badge>
  ) : (
    <Badge variant="outline">
      <EyeOff aria-hidden="true" /> Interno
    </Badge>
  );
}

export function OverdueBadge() {
  return (
    <Badge variant="destructive">
      <Clock aria-hidden="true" /> Atrasado
    </Badge>
  );
}

export function CycleStatusBadge({ status }: { status: string }) {
  return <Badge variant={status === "ABERTO" ? "success" : "secondary"}>{CYCLE_STATUS_LABEL[status] ?? status}</Badge>;
}

export function SubscriptionStatusBadge({ status }: { status: string }) {
  return <Badge variant={status === "ATIVA" ? "success" : status === "PAUSADA" ? "warning" : "secondary"}>{SUBSCRIPTION_STATUS_LABEL[status] ?? status}</Badge>;
}
