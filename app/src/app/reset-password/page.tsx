import { MailX, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/app/auth-card";
import { ResetPasswordForm } from "@/components/app/reset-password-form";
import { Button } from "@/components/ui/button";
import { isEmailDeliveryAvailable } from "@/server/config/email";

// O token de redefinicao esta na URL: nada de Referer para outros sites.
export const metadata: Metadata = { title: "Nova senha", referrer: "no-referrer" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[]; error?: string | string[] }>;
}) {
  const sp = await searchParams;
  const token = Array.isArray(sp.token) ? sp.token[0] : sp.token;

  if (token && token.length >= 10 && token.length <= 200 && !sp.error) {
    return (
      <AuthCard title="Defina uma nova senha" description="O link vale uma única vez. Ao salvar, as outras sessões desta conta são encerradas.">
        <ResetPasswordForm token={token} />
      </AuthCard>
    );
  }

  if (!token && !sp.error && !isEmailDeliveryAvailable()) {
    return (
      <AuthCard title="Redefinição de senha indisponível">
        <div className="flex items-start gap-3 text-sm" role="status">
          <MailX className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>O envio de e-mails ainda não está configurado neste ambiente. Peça ajuda ao administrador da agência.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/login">Voltar ao login</Link>
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Link inválido ou expirado">
      <div className="flex items-start gap-3 text-sm" role="alert">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
        <p>Este link não pode mais ser usado. Links de redefinição valem por pouco tempo e só funcionam uma vez.</p>
      </div>
      <Button asChild variant="outline">
        <Link href="/forgot-password">Pedir novo link</Link>
      </Button>
    </AuthCard>
  );
}
