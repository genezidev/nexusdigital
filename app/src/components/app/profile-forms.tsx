"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Field, FormError, PasswordInput, describedBy } from "@/components/app/field";
import { useThemeChoice, type ThemeChoice } from "@/components/app/theme";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api/client";
import { changePasswordSchema } from "@/lib/schemas";

type Values = z.infer<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: "", password: "", confirm: "" } });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      await api.changePassword({ currentPassword: values.currentPassword, newPassword: values.password });
      toast.success("Senha alterada. Suas outras sessões foram encerradas.");
      reset();
    } catch (error) {
      if (error instanceof ApiError && error.code === "INVALID_PASSWORD") setError("currentPassword", { message: error.message });
      else setFormError(error instanceof ApiError ? error.message : "Não foi possível alterar a senha. Tente novamente.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex max-w-md flex-col gap-5" aria-label="Trocar senha">
      <FormError message={formError} />
      <Field id="current-password" label="Senha atual" error={errors.currentPassword?.message}>
        <PasswordInput
          id="current-password"
          autoComplete="current-password"
          aria-invalid={errors.currentPassword ? true : undefined}
          aria-describedby={describedBy("current-password", errors.currentPassword?.message, undefined)}
          {...register("currentPassword")}
        />
      </Field>
      <Field id="new-password" label="Nova senha" hint="Mínimo de 12 caracteres." error={errors.password?.message}>
        <PasswordInput
          id="new-password"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={describedBy("new-password", errors.password?.message, "hint")}
          {...register("password")}
        />
      </Field>
      <Field id="confirm-password" label="Repita a nova senha" error={errors.confirm?.message}>
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          aria-invalid={errors.confirm ? true : undefined}
          aria-describedby={describedBy("confirm-password", errors.confirm?.message, undefined)}
          {...register("confirm")}
        />
      </Field>
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {isSubmitting ? "Salvando…" : "Alterar senha"}
        </Button>
      </div>
    </form>
  );
}

const OPTIONS: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: "LIGHT", label: "Claro", hint: "Fundo claro, ideal para ambientes iluminados." },
  { value: "DARK", label: "Escuro", hint: "Fundo escuro, menos brilho à noite." },
  { value: "SYSTEM", label: "Sistema", hint: "Segue a configuração do seu aparelho." },
];

/** Escolha de tema gravada na conta (vale em todos os seus aparelhos). */
export function ThemeChooser({ preference }: { preference: ThemeChoice }) {
  const { choice, change } = useThemeChoice(preference);
  return (
    <fieldset className="flex max-w-md flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">Aparência</legend>
      {OPTIONS.map((o) => (
        <label key={o.value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border bg-card p-3 has-[:checked]:border-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring">
          <input
            type="radio"
            name="theme"
            value={o.value}
            checked={choice === o.value}
            onChange={() => void change(o.value)}
            className="mt-1 size-4 accent-[var(--primary)]"
          />
          <span className="flex flex-col">
            <span className="text-sm font-medium">{o.label}</span>
            <span className="text-sm text-muted-foreground">{o.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
