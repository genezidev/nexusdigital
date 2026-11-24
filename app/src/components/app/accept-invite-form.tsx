"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Field, FormError, PasswordInput, describedBy } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api/client";
import { hardNavigate } from "@/lib/navigation";
import { acceptInvitationSchema } from "@/lib/schemas";
import type { z } from "zod";

type Values = z.infer<typeof acceptInvitationSchema>;

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(acceptInvitationSchema), defaultValues: { name: "", password: "", confirm: "" } });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await api.acceptInvitation({ token, name: values.name, password: values.password });
    } catch (error) {
      if (error instanceof ApiError) {
        // Erros por campo vindos do servidor aparecem junto do campo.
        for (const [field, message] of Object.entries(error.fields)) {
          if (field === "name" || field === "password") setError(field, { message });
        }
        setFormError(error.status === 422 && Object.keys(error.fields).length > 0 ? null : error.message);
      } else {
        setFormError("Não foi possível ativar a conta. Tente novamente.");
      }
      return;
    }
    // Conta criada. Entra automaticamente; se o login falhar, a conta continua valida e a pessoa entra pela tela de login.
    setAccepted(true);
    try {
      await api.login({ email, password: values.password });
      hardNavigate("/");
    } catch {
      setFormError("Conta ativada, mas não foi possível entrar automaticamente. Use a tela de login.");
    }
  }

  if (accepted) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <p className="text-sm">Conta ativada. {formError ?? "Entrando…"}</p>
        {formError ? (
          <Button asChild>
            <Link href="/login">Ir para o login</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5" aria-label="Ativar conta">
      <FormError message={formError} />
      <Field id="name" label="Seu nome" error={errors.name?.message}>
        <Input
          id="name"
          autoComplete="name"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy("name", errors.name?.message, undefined)}
          {...register("name")}
        />
      </Field>
      <Field id="password" label="Crie uma senha" hint="Mínimo de 12 caracteres." error={errors.password?.message}>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={describedBy("password", errors.password?.message, "hint")}
          {...register("password")}
        />
      </Field>
      <Field id="confirm" label="Repita a senha" error={errors.confirm?.message}>
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
        {isSubmitting ? "Ativando…" : "Ativar conta e entrar"}
      </Button>
    </form>
  );
}
