import { MailX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/app/auth-card";
import { ForgotPasswordForm } from "@/components/app/forgot-password-form";
import { Button } from "@/components/ui/button";
import { isEmailDeliveryAvailable } from "@/server/config/email";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  if (!isEmailDeliveryAvailable()) {
    // Estado honesto: sem envio de e-mail nao existe link de redefinicao. Nada de "enviamos um e-mail".
    return (
      <AuthCard title="Recuperação de senha indisponível">
        <div className="flex items-start gap-3 text-sm" role="status">
          <MailX className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>
            O envio de e-mails ainda não está configurado neste ambiente, por isso não conseguimos enviar o link para
            redefinir a senha. Peça ajuda ao administrador da agência.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/login">Voltar ao login</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Recuperar senha" description="Informe o e-mail da conta. Se ela existir, enviaremos um link de uso único.">
      <ForgotPasswordForm />
      <Button asChild variant="ghost">
        <Link href="/login">Voltar ao login</Link>
      </Button>
    </AuthCard>
  );
}
