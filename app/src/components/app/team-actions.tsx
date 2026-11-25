"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Loader2, MailX, UserCheck, UserPlus, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Field, FormError, describedBy } from "@/components/app/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api/client";
import { formatDate } from "@/lib/formatting/date";
import { teamEmail } from "@/lib/schemas-team";

const inviteForm = z.object({ email: teamEmail, approve: z.boolean() });
type Values = z.infer<typeof inviteForm>;
interface Created {
  link: string;
  expiresAt: string;
  email: string;
}

/**
 * Convite de colaborador pelo dono. Permissao padrao: ver e comentar. "Aprovar conteudos" e opcional e marcado de forma
 * explicita. Sem e-mail ainda: o link aparece UMA vez para o dono copiar (o token nao e guardado, so o hash).
 */
export function TeamInviteDialog({ clientName }: { clientName: string }) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(inviteForm), defaultValues: { email: "", approve: false } });

  async function onSubmit(values: Values) {
    setFormError(null);
    try {
      const result = await api.inviteTeamMember({ email: values.email, approve: values.approve });
      setCreated({ link: result.link, expiresAt: result.expiresAt, email: values.email });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields.email) setError("email", { message: error.fields.email });
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
      linkRef.current?.select();
      toast.error("Não foi possível copiar sozinho. O link está selecionado: use Ctrl+C.");
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // O link some ao fechar: so o hash do token fica no servidor.
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
          <UserPlus aria-hidden="true" /> Convidar colaborador
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
                O envio por e-mail ainda não está disponível, então <strong>nenhum e-mail foi enviado</strong>. Copie o link e envie à pessoa por um canal
                seguro. <strong>Este link aparece só agora</strong>: depois de fechar esta janela não será possível vê-lo de novo (crie outro convite se precisar).
              </p>
            </div>
            <Field id={`${id}-link`} label="Link do convite">
              <div className="flex gap-2">
                <Input id={`${id}-link`} ref={linkRef} readOnly value={created.link} onFocus={(e) => e.currentTarget.select()} />
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
              <DialogTitle>Convidar colaborador</DialogTitle>
              <DialogDescription>Convite de uso único para {clientName}, válido por 7 dias. A pessoa entra como colaborador.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4" aria-label="Convidar colaborador">
              <FormError message={formError} />
              <Field id={`${id}-email`} label="E-mail da pessoa" error={errors.email?.message}>
                <Input
                  id={`${id}-email`}
                  type="email"
                  autoComplete="off"
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={describedBy(`${id}-email`, errors.email?.message, undefined)}
                  {...register("email")}
                />
              </Field>
              <fieldset className="flex flex-col gap-3 rounded-md border p-3">
                <legend className="px-1 text-sm font-medium">Permissões</legend>
                <p className="text-sm text-muted-foreground">Todo colaborador pode ver as peças, o calendário e os roteiros e comentar. Marque abaixo só se ele também puder decidir.</p>
                <div className="flex items-start gap-3">
                  <input id={`${id}-approve`} type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" {...register("approve")} />
                  <label htmlFor={`${id}-approve`} className="text-sm">
                    <span className="font-medium">Pode aprovar conteúdos</span>
                    <span className="block text-muted-foreground">Aprovar ou pedir revisão vale como decisão do cliente e fica registrado em nome dessa pessoa.</span>
                  </label>
                </div>
              </fieldset>
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

/** Acoes sobre um colaborador: permissao de aprovar (liga e desliga) e desativar ou reativar o acesso. */
export function TeamMemberActions({ memberId, name, canApprove, active }: { memberId: string; name: string; canApprove: boolean; active: boolean }) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  // O servidor decide; a caixa so muda depois que ele confirma (nunca mostra permissao que nao foi gravada).
  const [approved, setApproved] = useState(canApprove);

  async function toggleApprove(next: boolean) {
    setBusy(true);
    try {
      await api.setTeamMemberApproval(memberId, next);
      setApproved(next);
      toast.success(next ? `${name} agora pode aprovar conteúdos.` : `${name} não aprova mais conteúdos.`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível alterar a permissão.");
    } finally {
      setBusy(false);
    }
  }

  async function reactivate() {
    setBusy(true);
    try {
      await api.setTeamMemberActive(memberId, true);
      toast.success(`${name} voltou a ter acesso.`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível reativar o acesso.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {active ? (
        <>
          <label htmlFor={`${id}-approve`} className="flex min-h-11 items-center gap-2 text-sm">
            <input id={`${id}-approve`} type="checkbox" className="size-5 accent-[var(--primary)]" checked={approved} disabled={busy} onChange={(e) => void toggleApprove(e.target.checked)} />
            <span>
              Pode aprovar <span className="sr-only">conteúdos ({name})</span>
            </span>
          </label>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(true)} disabled={busy} aria-label={`Desativar ${name}`}>
            <UserX aria-hidden="true" /> Desativar
          </Button>
          <ConfirmAction
            open={confirm}
            onOpenChange={setConfirm}
            title={`Desativar ${name}?`}
            description="A pessoa perde o acesso a este cliente na hora. O histórico dela (comentários e decisões) continua registrado. Você pode reativar depois."
            confirmLabel="Desativar acesso"
            successMessage={`${name} foi desativado.`}
            action={() => api.setTeamMemberActive(memberId, false)}
          />
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={() => void reactivate()} disabled={busy} aria-label={`Reativar ${name}`}>
          <UserCheck aria-hidden="true" /> Reativar
        </Button>
      )}
    </div>
  );
}

export function RevokeTeamInvitationButton({ invitationId, email }: { invitationId: string; email: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Revogar convite de ${email}`}>
        Revogar
      </Button>
      <ConfirmAction
        open={open}
        onOpenChange={setOpen}
        title="Revogar este convite?"
        description={`O link enviado para ${email} deixa de funcionar. Você pode criar outro convite depois.`}
        confirmLabel="Revogar convite"
        successMessage="Convite revogado."
        action={() => api.revokeTeamInvitation(invitationId)}
      />
    </>
  );
}
