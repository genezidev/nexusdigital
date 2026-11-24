"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Field, FormError, PasswordInput, describedBy } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api/client";
import { resetPasswordSchema } from "@/lib/schemas";
import type { z } from "zod";

type Values = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm({ token }: { token: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", confirm: "" } });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await api.resetPassword({ token, newPassword: values.password });
      setDone(true);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Não foi possível redefinir a senha. Tente novamente.");
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <p className="text-sm">Senha alterada. Por segurança, as outras sessões foram encerradas. Entre com a nova senha.</p>
        <Button asChild>
          <Link href="/login">Ir para o login</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5" aria-label="Definir nova senha">
      <FormError message={formError} />
      <Field id="password" label="Nova senha" hint="Mínimo de 12 caracteres." error={errors.password?.message}>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={describedBy("password", errors.password?.message, "hint")}
          {...register("password")}
        />
      </Field>
      <Field id="confirm" label="Repita a nova senha" error={errors.confirm?.message}>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          aria-invalid={errors.confirm ? true : undefined}
          aria-describedby={describedBy("confirm", errors.confirm?.message, undefined)}
          {...register("confirm")}
        />
      </Field>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {isSubmitting ? "Salvando…" : "Salvar nova senha"}
      </Button>
    </form>
  );
}
