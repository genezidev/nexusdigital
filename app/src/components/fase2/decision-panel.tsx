"use client";

import { Check, MessageSquareWarning, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api/client";

const STALE_CODES = new Set(["STALE_VERSION", "ALREADY_DECIDED", "NOT_AWAITING"]);

/**
 * Decisao do cliente, SEMPRE ligada a versao exibida (versionId vem da pagina, nunca de um campo editavel).
 * Se o servidor disser que a versao ficou desatualizada (ou ja foi decidida), a tela trava os botoes e oferece recarregar.
 * Este componente so e montado para quem tem permissao; o servidor decide de novo na API.
 */
export function DecisionPanel({ contentId, versionId, versionNumber }: { contentId: string; versionId: string; versionNumber: number }) {
  const router = useRouter();
  const [stale, setStale] = useState<string | null>(null);

  async function decide(decision: "APROVADO" | "REVISAO_SOLICITADA", comment: string) {
    try {
      return await api.decide(contentId, versionId, { decision, comment: comment.trim() || undefined });
    } catch (error) {
      if (error instanceof ApiError && STALE_CODES.has(error.code)) setStale(error.message);
      throw error;
    }
  }

  if (stale) {
    return (
      <Alert variant="destructive" role="alert" data-testid="decision-stale">
        <MessageSquareWarning aria-hidden="true" />
        <AlertTitle>Versão desatualizada</AlertTitle>
        <AlertDescription>
          <p>{stale}</p>
          <Button className="mt-3" variant="outline" onClick={() => router.refresh()}>
            <RefreshCw aria-hidden="true" /> Carregar a versão atual
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-wrap gap-2" data-testid="decision-panel">
      <ReasonDialog
        trigger={
          <Button>
            <Check aria-hidden="true" /> Aprovar versão {versionNumber}
          </Button>
        }
        title={`Aprovar a versão ${versionNumber}`}
        description="Sua aprovação fica registrada com o seu nome, o horário e esta versão. Se a agência mudar o material depois, será preciso aprovar de novo."
        fieldLabel="Comentário (opcional)"
        minLength={0}
        submitLabel="Confirmar aprovação"
        successMessage="Versão aprovada."
        run={(comment) => decide("APROVADO", comment)}
      />
      <ReasonDialog
        trigger={
          <Button variant="outline">
            <MessageSquareWarning aria-hidden="true" /> Pedir revisão
          </Button>
        }
        title={`Pedir revisão da versão ${versionNumber}`}
        description="Diga o que precisa mudar. A agência recebe o seu comentário e envia uma nova versão."
        fieldLabel="O que precisa mudar"
        minLength={1}
        submitLabel="Enviar pedido de revisão"
        successMessage="Pedido de revisão enviado."
        run={(comment) => decide("REVISAO_SOLICITADA", comment)}
      />
    </div>
  );
}
