"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Field, FormError, describedBy } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api/client";
import { forgotPasswordSchema } from "@/lib/schemas";
import type { z } from "zod";

type Values = z.infer<typeof forgotPasswordSchema>;

// So e exibido quando o servidor informa que o envio de e-mail esta disponivel (isEmailDeliveryAvailable).
// A mensagem de sucesso e a mesma exista ou nao uma conta com o e-mail.
export function ForgotPasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await api.requestPasswordReset(values);
      setSent(true);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Não foi possível enviar agora. Tente novamente.");
    }
  }

  if (sent) {
    return (
      <p role="status" className="text-sm">
        Se existir uma conta com este e-mail, enviamos um link para redefinir a senha. O link vale por tempo limitado e só pode ser usado uma vez.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5" aria-label="Recuperar senha">
      <FormError message={formError} />
      <Field id="email" label="E-mail da conta" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy("email", errors.email?.message, undefined)}
          {...register("email")}
        />
      </Field>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {isSubmitting ? "Enviando…" : "Enviar link de redefinição"}
      </Button>
    </form>
  );
}
