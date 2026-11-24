import { TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AcceptInviteForm } from "@/components/app/accept-invite-form";
import { AuthCard } from "@/components/app/auth-card";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/schemas";
import { formatDate } from "@/lib/formatting/date";
import { getDb } from "@/server/db/client";
import { peekInvitation } from "@/server/services/invitations";

// O token do convite esta na URL: nada de Referer para outros sites.
export const metadata: Metadata = { title: "Ativar conta", referrer: "no-referrer" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  // A validade do convite depende da hora atual: a pagina e sempre renderizada no momento do pedido.
  await connection();
  const { token } = await params;
  const preview = await peekInvitation(getDb(), token);

  // Mesmo texto para token inexistente, usado, revogado ou expirado (a API responde 410 em todos).
  if (!preview) {
    return (
      <AuthCard title="Convite inválido ou expirado" description="Este link não pode mais ser usado.">
        <div className="flex items-start gap-3 text-sm" role="alert">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
          <p>
            Convites valem por 7 dias e só podem ser usados uma vez. Peça um novo link ao administrador da agência.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/login">Ir para o login</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Ative sua conta"
      description={`Você foi convidado para ${preview.clientName} como ${ROLE_LABEL[preview.role]?.toLowerCase() ?? "membro"}.`}
    >
      <p className="text-sm text-muted-foreground">
        E-mail da conta: <strong className="font-semibold text-foreground">{preview.email}</strong>. O convite vale até{" "}
        {formatDate(preview.expiresAt)}.
      </p>
      <AcceptInviteForm token={token} email={preview.email} />
    </AuthCard>
  );
}
