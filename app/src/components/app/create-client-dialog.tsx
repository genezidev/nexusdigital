"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Field, FormError, describedBy } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, api } from "@/lib/api/client";
import { createClientSchema } from "@/lib/schemas";
import { DEFAULT_TIMEZONE, TIMEZONES } from "@/lib/timezones";

type Input_ = z.input<typeof createClientSchema>;
type Output_ = z.output<typeof createClientSchema>;

export function CreateClientDialog({ label = "Novo cliente" }: { label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Input_, unknown, Output_>({
    resolver: zodResolver(createClientSchema),
    defaultValues: { name: "", contactName: "", contactEmail: "", timezone: DEFAULT_TIMEZONE },
  });

  async function onSubmit(values: Output_) {
    setFormError(null);
    try {
      const client = await api.createClient(values);
      toast.success(`Cliente "${client.name}" criado.`);
      setOpen(false);
      reset();
      router.push(`/admin/clients/${client.id}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fields)) {
          if (field === "name" || field === "contactName" || field === "contactEmail" || field === "timezone") setError(field, { message });
        }
        setFormError(error.status === 422 && Object.keys(error.fields).length > 0 ? null : error.message);
      } else {
        setFormError("Não foi possível criar o cliente. Tente novamente.");
      }
    }
  }

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
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
          <DialogDescription>Cadastre a empresa. Depois você poderá convidar as pessoas dela.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4" aria-label="Novo cliente">
          <FormError message={formError} />
          <Field id="client-name" label="Nome do cliente" error={errors.name?.message}>
            <Input
              id="client-name"
              autoComplete="off"
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={describedBy("client-name", errors.name?.message, undefined)}
              {...register("name")}
            />
          </Field>
          <Field id="client-contact" label="Nome do contato (opcional)" error={errors.contactName?.message}>
            <Input id="client-contact" autoComplete="off" aria-invalid={errors.contactName ? true : undefined} {...register("contactName")} />
          </Field>
          <Field id="client-email" label="E-mail do contato (opcional)" error={errors.contactEmail?.message}>
            <Input
              id="client-email"
              type="email"
              autoComplete="off"
              aria-invalid={errors.contactEmail ? true : undefined}
              aria-describedby={describedBy("client-email", errors.contactEmail?.message, undefined)}
              {...register("contactEmail")}
            />
          </Field>
          <Field id="client-timezone" label="Fuso horário" error={errors.timezone?.message}>
            <Controller
              control={control}
              name="timezone"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="client-timezone" className="w-full" aria-invalid={errors.timezone ? true : undefined}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {isSubmitting ? "Criando…" : "Criar cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
