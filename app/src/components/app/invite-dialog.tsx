"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Loader2, MailX, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Field, FormError, describedBy } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, api } from "@/lib/api/client";
import { formatDate } from "@/lib/formatting/date";
import { inviteSchema, ROLE_LABEL } from "@/lib/schemas";

type Values = z.infer<typeof inviteSchema>;
interface Created {
  link: string;
  expiresAt: string;
  email: string;
}

export function InviteDialog({ clientId, clientName }: { clientId: string; clientName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(inviteSchema), defaultValues: { email: "", role: "CLIENT_OWNER" } });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      const result = await api.createInvitation(clientId, values);
      setCreated({ link: result.link, expiresAt: result.expiresAt, email: values.email });
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fields)) {
          if (field === "email" || field === "role") setError(field, { message });
        }
        setFormError(error.status === 422 && Object.keys(error.fields).length > 0 ? null : error.message);
      } else {
        setFormError("Não foi possível criar o convite. Tente novamente.");
      }
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(created!.link);
      setCopied(true);
      toast.success("Link copiado.");
    } catch {
      // Sem permissao de area de transferencia: seleciona o texto para copiar com Ctrl+C.
      linkRef.current?.select();
      toast.error("Não foi possível copiar sozinho. O link está selecionado: use Ctrl+C.");
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // O link some ao fechar: o token nao e guardado em lugar nenhum, so o hash dele no servidor.
      if (created) router.refresh();
      setCreated(null);
      setCopied(false);
      setFormError(null);
      reset();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden="true" /> Convidar pessoa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Convite criado</DialogTitle>
              <DialogDescription>
                Para {created.email}, em {clientName}. Vale até {formatDate(created.expiresAt)} e só pode ser usado uma vez.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-start gap-3 rounded-md border bg-muted p-3 text-sm" role="status">
              <MailX className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <p>
                O envio por e-mail não está configurado neste ambiente, então <strong>nenhum e-mail foi enviado</strong>. Copie o link e
                envie à pessoa por um canal seguro. <strong>Este link aparece só agora</strong>: depois de fechar esta janela não será
                possível vê-lo de novo (crie outro convite se precisar).
              </p>
            </div>
            <Field id="invite-link" label="Link do convite">
              <div className="flex gap-2">
                <Input id="invite-link" ref={linkRef} readOnly value={created.link} onFocus={(e) => e.currentTarget.select()} />
                <Button type="button" variant="outline" onClick={() => void copy()} className="shrink-0">
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>
            </Field>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Concluir
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Convidar pessoa</DialogTitle>
              <DialogDescription>Convite de uso único para {clientName}. Vale por 7 dias.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4" aria-label="Convidar pessoa">
              <FormError message={formError} />
              <Field id="invite-email" label="E-mail da pessoa" error={errors.email?.message}>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={describedBy("invite-email", errors.email?.message, undefined)}
                  {...register("email")}
                />
              </Field>
              <Field id="invite-role" label="Papel" error={errors.role?.message}>
                <Controller
                  control={control}
                  name="role"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="invite-role" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLIENT_OWNER">{ROLE_LABEL.CLIENT_OWNER}</SelectItem>
                        <SelectItem value="CLIENT_COLLABORATOR">{ROLE_LABEL.CLIENT_COLLABORATOR}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  {isSubmitting ? "Criando…" : "Criar convite"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
