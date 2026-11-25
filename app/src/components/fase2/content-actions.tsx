"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock, Loader2, Send, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Field } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";
import { applyApiError } from "@/components/app/form-utils";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError, api } from "@/lib/api/client";
import { publishForm } from "@/lib/forms-fase2";

const MANUAL_LABEL: Record<string, string> = {
  EM_PRODUCAO: "Iniciar produção",
  AGENDADO: "Registrar como agendado",
  ANALISADO: "Marcar como analisado",
};

type PublishValues = z.input<typeof publishForm>;

function PublishDialog({ clientId, contentId }: { clientId: string; contentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PublishValues, unknown, z.output<typeof publishForm>>({ resolver: zodResolver(publishForm), defaultValues: { publishedOn: "", publicationUrl: "" } });
  async function onSubmit(v: z.output<typeof publishForm>) {
    setFormError(null);
    try {
      // Meio-dia local: a data nao muda de dia por causa do fuso.
      const publishedAt = new Date(`${v.publishedOn}T12:00:00`).toISOString();
      await api.setContentStatus(clientId, contentId, { to: "PUBLICADO", publishedAt, publicationUrl: v.publicationUrl || undefined });
      toast.success("Publicação registrada. Nada foi publicado automaticamente.");
      setOpen(false);
      reset();
      router.refresh();
    } catch (error) {
      applyApiError<PublishValues>(error, { setError, fieldMap: { publicationUrl: "publicationUrl" }, setFormError, fallback: "Não foi possível registrar a publicação." });
    }
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={(n) => {
        setOpen(n);
        if (!n) {
          setFormError(null);
          reset();
        }
      }}
      trigger={<Button>Registrar publicação</Button>}
      title="Registrar publicação"
      description="Registro manual: o sistema não publica nada. Informe a data e a URL HTTPS da publicação (no Instagram, de instagram.com)."
      submitLabel="Registrar publicação"
      submitting={isSubmitting}
      formError={formError}
      onSubmit={handleSubmit(onSubmit)}
    >
      <Field id="pub-date" label="Data da publicação" error={errors.publishedOn?.message}>
        <Input id="pub-date" type="date" aria-invalid={errors.publishedOn ? true : undefined} {...register("publishedOn")} />
      </Field>
      <Field id="pub-url" label="URL da publicação" error={errors.publicationUrl?.message} hint="https://... Sem usuário, senha nem porta.">
        <Input id="pub-url" type="url" inputMode="url" autoComplete="off" aria-invalid={errors.publicationUrl ? true : undefined} {...register("publicationUrl")} />
      </Field>
    </FormDialog>
  );
}

/**
 * Fluxo de status: so aparecem as transicoes que o servidor permite a partir do status atual (calculadas na pagina
 * pela maquina de estados unica). AGUARDANDO_APROVACAO so se alcanca ENVIANDO uma versao; APROVADO so pelo cliente.
 */
export function ContentStatusPanel({
  clientId,
  contentId,
  manualTargets,
  canSend,
  sendHint,
  draftVersionId,
  canCancel,
}: {
  clientId: string;
  contentId: string;
  /** Alvos manuais permitidos (sem CANCELADO). */
  manualTargets: string[];
  canSend: boolean;
  sendHint?: string;
  draftVersionId?: string;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);

  async function move(to: string) {
    setBusy(to);
    try {
      await api.setContentStatus(clientId, contentId, { to });
      toast.success("Status atualizado.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível mudar o status.");
    } finally {
      setBusy(null);
    }
  }

  const simple = manualTargets.filter((t) => t !== "PUBLICADO" && t !== "CANCELADO");
  const none = simple.length === 0 && !manualTargets.includes("PUBLICADO") && !canSend && !canCancel;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canSend ? (
          <Button onClick={() => setConfirmSend(true)}>
            <Send aria-hidden="true" /> Enviar para aprovação
          </Button>
        ) : null}
        {simple.map((t) => (
          <Button key={t} variant="outline" disabled={busy !== null} onClick={() => void move(t)}>
            {busy === t ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {MANUAL_LABEL[t] ?? t}
          </Button>
        ))}
        {manualTargets.includes("PUBLICADO") ? <PublishDialog clientId={clientId} contentId={contentId} /> : null}
        {canCancel ? (
          <ReasonDialog
            trigger={<Button variant="destructive">Cancelar peça</Button>}
            title="Cancelar esta peça?"
            description="Cancelar é definitivo: a peça sai de todos os contadores e não volta. Explique o motivo."
            submitLabel="Cancelar peça"
            successMessage="Peça cancelada."
            destructive
            run={(reason) => api.setContentStatus(clientId, contentId, { to: "CANCELADO", cancelReason: reason })}
          />
        ) : null}
      </div>
      {!canSend && sendHint ? <p className="text-sm text-muted-foreground">{sendHint}</p> : null}
      {none ? <p className="text-sm text-muted-foreground">Nenhuma ação de status disponível neste estado.</p> : null}
      <ConfirmAction
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title="Enviar esta versão para aprovação?"
        description="A versão fica imutável e entra na fila do cliente. Para mudar depois, será preciso criar uma nova versão."
        confirmLabel="Enviar para aprovação"
        successMessage="Versão enviada para aprovação."
        destructive={false}
        action={() => api.sendVersion(clientId, contentId, draftVersionId)}
      />
    </div>
  );
}

export function RescheduleDialog({ clientId, contentId, current, min, max, name }: { clientId: string; contentId: string; current: string; min: string; max: string; name?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.reschedule(clientId, contentId, date);
      toast.success("Peça reagendada.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível reagendar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={(n) => {
        setOpen(n);
        if (!n) {
          setError(null);
          setDate(current);
        }
      }}
      trigger={
        <Button variant="outline" size="sm" aria-label={name ? `Reagendar ${name}` : undefined}>
          <CalendarClock aria-hidden="true" /> Reagendar
        </Button>
      }
      title="Reagendar peça"
      description="A nova data precisa ficar dentro do mês do ciclo. Para sair dele, mova a peça de ciclo (só o administrador, com justificativa)."
      submitLabel="Reagendar"
      submitting={busy}
      formError={error}
      onSubmit={submit}
    >
      <Field id="resched-date" label="Nova data prevista">
        <Input id="resched-date" type="date" value={date} min={min} max={max} onChange={(e) => setDate(e.target.value)} required />
      </Field>
    </FormDialog>
  );
}

export function ShareToggle({ clientId, contentId, visibility }: { clientId: string; contentId: string; visibility: string }) {
  const [open, setOpen] = useState(false);
  const shared = visibility === "COMPARTILHADO";
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Share2 aria-hidden="true" /> {shared ? "Voltar a interno" : "Compartilhar com o cliente"}
      </Button>
      <ConfirmAction
        open={open}
        onOpenChange={setOpen}
        title={shared ? "Esconder esta peça do cliente?" : "Compartilhar esta peça com o cliente?"}
        description={
          shared
            ? "O cliente deixa de ver a peça, as versões e os comentários compartilhados."
            : "O cliente passa a ver título, formato, data, status e as versões ENVIADAS (legenda, CTA, hashtags e arquivos). Rascunhos, briefing e notas internas continuam escondidos."
        }
        confirmLabel={shared ? "Voltar a interno" : "Compartilhar"}
        successMessage={shared ? "Peça voltou a ser interna." : "Peça compartilhada com o cliente."}
        destructive={false}
        action={() => api.setVisibility(clientId, contentId, shared ? "INTERNO" : "COMPARTILHADO")}
      />
    </>
  );
}

export function ClassificationPanel({ clientId, contentId, counts, bonus }: { clientId: string; contentId: string; counts: boolean; bonus: boolean }) {
  const router = useRouter();
  const [c, setC] = useState(counts);
  const [b, setB] = useState(bonus);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api.setClassification(clientId, contentId, { countsTowardQuota: c, isBonus: b });
      toast.success("Classificação salva e registrada na auditoria.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <input id="cls-counts" type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={c} onChange={(e) => setC(e.target.checked)} />
        <label htmlFor="cls-counts" className="text-sm">
          Conta na cota mensal
        </label>
      </div>
      <div className="flex items-start gap-3">
        <input id="cls-bonus" type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={b} onChange={(e) => setB(e.target.checked)} />
        <label htmlFor="cls-bonus" className="text-sm">
          Bônus (fora da cota, mostrado à parte)
        </label>
      </div>
      <div>
        <Button variant="outline" disabled={busy || (c === counts && b === bonus)} onClick={() => void save()}>
          Salvar classificação
        </Button>
      </div>
    </div>
  );
}

export function MoveCycleDialog({ clientId, contentId, cycles }: { clientId: string; contentId: string; cycles: { id: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cycleId, setCycleId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!cycleId) return setError("Escolha o ciclo de destino.");
    if (reason.trim().length < 10) return setError("Explique o motivo com pelo menos 10 caracteres.");
    setBusy(true);
    setError(null);
    try {
      await api.moveToCycle(clientId, contentId, { cycleId, reason: reason.trim() });
      toast.success("Peça movida de ciclo.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível mover a peça.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="outline" size="sm" disabled={cycles.length === 0}>
          Mover de ciclo
        </Button>
      }
      title="Mover peça para outro ciclo"
      description="Ação explícita do administrador, registrada na auditoria."
      submitLabel="Mover peça"
      submitting={busy}
      formError={error}
      onSubmit={submit}
    >
      <Field id="mv-cycle" label="Ciclo de destino">
        <NativeSelect id="mv-cycle" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
          <option value="">Escolha o ciclo</option>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="mv-reason" label="Justificativa" hint="Mínimo de 10 caracteres.">
        <Input id="mv-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </FormDialog>
  );
}
