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
import { loginSchema, type LoginInput } from "@/lib/schemas";

export function LoginForm({ next }: { next: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: LoginInput) {
    setFormError(null);
    try {
      await api.login(values);
      // Navegacao completa: o servidor decide o destino pelo papel e nada da tela de login sobrevive.
      hardNavigate(next);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : "Não foi possível entrar. Tente novamente.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5" aria-label="Entrar">
      <FormError message={formError} />
      <Field id="email" label="E-mail" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy("email", errors.email?.message, undefined)}
          {...register("email")}
        />
      </Field>
      <Field id="password" label="Senha" error={errors.password?.message}>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={describedBy("password", errors.password?.message, undefined)}
          {...register("password")}
        />
      </Field>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {isSubmitting ? "Entrando…" : "Entrar"}
      </Button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="font-medium text-primary underline-offset-4 hover:underline">
          Esqueci minha senha
        </Link>
      </p>
    </form>
  );
}
