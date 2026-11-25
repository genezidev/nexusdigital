"use client";

import { Loader2 } from "lucide-react";
import type { FormEventHandler, ReactNode } from "react";
import { FormError } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * Casca dos formularios em modal: titulo, descricao, erro do formulario, rodape com cancelar/confirmar e rolagem
 * dentro do modal em telas baixas. Quem usa cuida do React Hook Form e passa `onSubmit` (ja com handleSubmit).
 */
export function FormDialog({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  busyLabel,
  submitting,
  formError,
  onSubmit,
  destructive = false,
  wide = false,
  children,
}: {
  trigger: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  submitLabel: string;
  busyLabel?: string;
  submitting: boolean;
  formError: string | null;
  onSubmit: FormEventHandler<HTMLFormElement>;
  destructive?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={`max-h-[calc(100dvh-2rem)] overflow-y-auto ${wide ? "sm:max-w-2xl" : ""}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-label={title}>
          <FormError message={formError} />
          {children}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {submitting ? (busyLabel ?? "Salvando…") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
