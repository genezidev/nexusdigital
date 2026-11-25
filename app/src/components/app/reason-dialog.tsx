"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Field, FormError, describedBy } from "@/components/app/field";
import { applyApiError } from "@/components/app/form-utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { reasonForm, REASON_MIN } from "@/lib/forms-fase2";

/**
 * Modal de confirmacao com justificativa escrita (cancelar peca, pedir regravacao, reabrir ciclo, pedir revisao...).
 * A acao so roda no botao de confirmar; erro da API aparece no proprio modal (nunca sucesso simulado).
 */
export function ReasonDialog({
  trigger,
  title,
  description,
  fieldLabel = "Justificativa",
  minLength = REASON_MIN,
  submitLabel,
  successMessage,
  destructive = false,
  run,
  onDone,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  fieldLabel?: string;
  minLength?: number;
  submitLabel: string;
  successMessage: string;
  destructive?: boolean;
  run: (reason: string) => Promise<unknown>;
  onDone?: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const schema = reasonForm(minLength);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { reason: "" } });

  async function onSubmit(values: { reason: string }) {
    setFormError(null);
    try {
      await run(values.reason);
      toast.success(successMessage);
      setOpen(false);
      reset();
      onDone?.();
      router.refresh();
    } catch (error) {
      applyApiError(error, { setError, fieldMap: { reason: "reason", justification: "reason", comment: "reason", cancelReason: "reason" }, setFormError, fallback: "Não foi possível concluir. Tente novamente." });
    }
  }

  const fieldId = `${id}-reason`;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFormError(null);
          reset();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4" aria-label={title}>
          <FormError message={formError} />
          <Field id={fieldId} label={fieldLabel} error={errors.reason?.message} hint={minLength > 1 ? `Mínimo de ${minLength} caracteres.` : undefined}>
            <Textarea id={fieldId} rows={4} aria-invalid={errors.reason ? true : undefined} aria-describedby={describedBy(fieldId, errors.reason?.message, minLength > 1 ? "x" : undefined)} {...register("reason")} />
          </Field>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Voltar
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
