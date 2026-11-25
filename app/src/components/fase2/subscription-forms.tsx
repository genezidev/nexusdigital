"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Field, describedBy } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";
import { applyApiError } from "@/components/app/form-utils";
import { ReasonDialog } from "@/components/app/reason-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { cycleForm, quotaForm, subscriptionForm } from "@/lib/forms-fase2";
import { formatCents } from "@/lib/formatting/money";

export interface PlanOption {
  id: string;
  name: string;
  version: number;
  monthlyAmountCents: number;
  monthlyQuota: number;
}

type SubValues = z.input<typeof subscriptionForm>;

export function NewSubscriptionDialog({ clientId, plans }: { clientId: string; plans: PlanOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SubValues, unknown, z.output<typeof subscriptionForm>>({
    resolver: zodResolver(subscriptionForm),
    defaultValues: { planId: "", startsOn: "", endsOn: "", billingDay: "10" },
  });

  async function onSubmit(v: z.output<typeof subscriptionForm>) {
    setFormError(null);
    try {
      await api.createSubscription(clientId, { planId: v.planId, startsOn: v.startsOn, endsOn: v.endsOn || null, billingDay: v.billingDay });
      toast.success("Assinatura criada.");
      setOpen(false);
      reset();
      router.refresh();
    } catch (error) {
      applyApiError<SubValues>(error, { setError, fieldMap: { planId: "planId", startsOn: "startsOn", endsOn: "endsOn", billingDay: "billingDay" }, setFormError, fallback: "Não foi possível criar a assinatura." });
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFormError(null);
          reset();
        }
      }}
      trigger={
        <Button>
          <Plus aria-hidden="true" /> Nova assinatura
        </Button>
      }
      title="Nova assinatura"
      description="O valor, a cota e o escopo do plano são copiados para a assinatura e não mudam se o plano for alterado depois."
      submitLabel="Criar assinatura"
      busyLabel="Criando…"
      submitting={isSubmitting}
      formError={formError}
      onSubmit={handleSubmit(onSubmit)}
    >
      <Field id="sub-plan" label="Plano" error={errors.planId?.message}>
        <NativeSelect id="sub-plan" aria-invalid={errors.planId ? true : undefined} {...register("planId")}>
          <option value="">Escolha um plano</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (v{p.version}) · {formatCents(p.monthlyAmountCents)} · cota {p.monthlyQuota}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="sub-start" label="Início da vigência" error={errors.startsOn?.message}>
          <Input id="sub-start" type="date" aria-invalid={errors.startsOn ? true : undefined} {...register("startsOn")} />
        </Field>
        <Field id="sub-end" label="Fim da vigência (opcional)" error={errors.endsOn?.message}>
          <Input id="sub-end" type="date" aria-invalid={errors.endsOn ? true : undefined} {...register("endsOn")} />
        </Field>
      </div>
      <Field id="sub-billing" label="Dia de cobrança (1 a 28)" error={errors.billingDay?.message} hint="Só fica guardado: a cobrança é de uma fase futura.">
        <Input id="sub-billing" inputMode="numeric" aria-invalid={errors.billingDay ? true : undefined} aria-describedby={describedBy("sub-billing", errors.billingDay?.message, "x")} {...register("billingDay")} />
      </Field>
    </FormDialog>
  );
}

export function SubscriptionStatusActions({ clientId, id, status, name }: { clientId: string; id: string; status: string; name: string }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function set(next: "ATIVA" | "PAUSADA") {
    setBusy(true);
    try {
      await api.patchSubscription(clientId, id, { status: next });
      toast.success(next === "PAUSADA" ? "Assinatura pausada." : "Assinatura reativada.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a assinatura.");
    } finally {
      setBusy(false);
    }
  }
  if (status === "ENCERRADA") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {status === "ATIVA" ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void set("PAUSADA")} aria-label={`Pausar a assinatura ${name}`}>
          Pausar
        </Button>
      ) : (
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void set("ATIVA")} aria-label={`Reativar a assinatura ${name}`}>
          Reativar
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => setConfirmEnd(true)} aria-label={`Encerrar a assinatura ${name}`}>
        Encerrar
      </Button>
      <ConfirmAction
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="Encerrar esta assinatura?"
        description="A assinatura encerrada não abre novos ciclos e não volta a ficar ativa. Os ciclos existentes e o histórico continuam."
        confirmLabel="Encerrar assinatura"
        successMessage="Assinatura encerrada."
        action={() => api.patchSubscription(clientId, id, { status: "ENCERRADA" })}
      />
    </div>
  );
}

type CycleValues = z.input<typeof cycleForm>;

export function OpenCycleDialog({ clientId, subscriptionId, defaultYear, defaultMonth, defaultQuota, firstCycle }: { clientId: string; subscriptionId: string; defaultYear: number; defaultMonth: number; defaultQuota: number; firstCycle: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CycleValues, unknown, z.output<typeof cycleForm>>({
    resolver: zodResolver(cycleForm),
    defaultValues: { year: String(defaultYear), month: String(defaultMonth), quota: "", reason: "" },
  });
  const quotaTyped = useWatch({ control, name: "quota" });

  async function onSubmit(v: z.output<typeof cycleForm>) {
    setFormError(null);
    if (v.quota !== undefined && v.quota !== defaultQuota && v.reason.trim().length < 10) {
      setError("reason", { message: "Explique o ajuste da cota com pelo menos 10 caracteres." });
      return;
    }
    try {
      await api.openCycle(clientId, { subscriptionId, year: v.year, month: v.month, quota: v.quota, reason: v.reason.trim() || undefined });
      toast.success("Ciclo aberto.");
      setOpen(false);
      reset();
      router.refresh();
    } catch (error) {
      applyApiError<CycleValues>(error, { setError, fieldMap: { year: "year", month: "month", quota: "quota", reason: "reason" }, setFormError, fallback: "Não foi possível abrir o ciclo." });
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFormError(null);
          reset();
        }
      }}
      trigger={
        <Button>
          <Plus aria-hidden="true" /> Abrir ciclo
        </Button>
      }
      title="Abrir ciclo do mês"
      description={`A cota do ciclo é copiada da assinatura (${defaultQuota}) e fica gravada. ${firstCycle ? "Este é o primeiro ciclo: se a vigência começa no meio do mês, você pode ajustar a cota, com justificativa." : ""}`}
      submitLabel="Abrir ciclo"
      busyLabel="Abrindo…"
      submitting={isSubmitting}
      formError={formError}
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cycle-year" label="Ano" error={errors.year?.message}>
          <Input id="cycle-year" inputMode="numeric" aria-invalid={errors.year ? true : undefined} {...register("year")} />
        </Field>
        <Field id="cycle-month" label="Mês (1 a 12)" error={errors.month?.message}>
          <Input id="cycle-month" inputMode="numeric" aria-invalid={errors.month ? true : undefined} {...register("month")} />
        </Field>
      </div>
      <Field id="cycle-quota" label={`Cota do ciclo (vazio = ${defaultQuota}, a da assinatura)`} error={errors.quota?.message}>
        <Input id="cycle-quota" inputMode="numeric" aria-invalid={errors.quota ? true : undefined} {...register("quota")} />
      </Field>
      {quotaTyped && quotaTyped.trim() !== String(defaultQuota) ? (
        <Field id="cycle-reason" label="Justificativa do ajuste da cota" error={errors.reason?.message}>
          <Textarea id="cycle-reason" rows={3} aria-invalid={errors.reason ? true : undefined} {...register("reason")} />
        </Field>
      ) : null}
    </FormDialog>
  );
}

type QuotaValues = z.input<typeof quotaForm>;

export function AdjustQuotaDialog({ clientId, cycleId, current, label }: { clientId: string; cycleId: string; current: number; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<QuotaValues, unknown, z.output<typeof quotaForm>>({ resolver: zodResolver(quotaForm), defaultValues: { quota: String(current), reason: "" } });

  async function onSubmit(v: z.output<typeof quotaForm>) {
    setFormError(null);
    try {
      await api.setCycleQuota(clientId, cycleId, { quota: v.quota, reason: v.reason });
      toast.success("Cota ajustada. O valor anterior fica guardado com a justificativa.");
      setOpen(false);
      router.refresh();
    } catch (error) {
      applyApiError<QuotaValues>(error, { setError, fieldMap: { quota: "quota", reason: "reason" }, setFormError, fallback: "Não foi possível ajustar a cota." });
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFormError(null);
          reset({ quota: String(current), reason: "" });
        }
      }}
      trigger={
        <Button variant="outline" size="sm" aria-label={`Ajustar cota de ${label}`}>
          Ajustar cota
        </Button>
      }
      title={`Ajustar a cota de ${label}`}
      description={`Cota atual: ${current}. O valor anterior e a justificativa ficam guardados na auditoria.`}
      submitLabel="Salvar nova cota"
      submitting={isSubmitting}
      formError={formError}
      onSubmit={handleSubmit(onSubmit)}
    >
      <Field id="quota-new" label="Nova cota" error={errors.quota?.message}>
        <Input id="quota-new" inputMode="numeric" aria-invalid={errors.quota ? true : undefined} {...register("quota")} />
      </Field>
      <Field id="quota-reason" label="Justificativa" error={errors.reason?.message} hint="Mínimo de 10 caracteres.">
        <Textarea id="quota-reason" rows={3} aria-invalid={errors.reason ? true : undefined} aria-describedby={describedBy("quota-reason", errors.reason?.message, "x")} {...register("reason")} />
      </Field>
    </FormDialog>
  );
}

export function CycleActions({ clientId, cycleId, status, label }: { clientId: string; cycleId: string; status: string; label: string }) {
  const [confirmClose, setConfirmClose] = useState(false);
  if (status === "ABERTO") {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setConfirmClose(true)} aria-label={`Encerrar ciclo de ${label}`}>
          Encerrar ciclo
        </Button>
        <ConfirmAction
          open={confirmClose}
          onOpenChange={setConfirmClose}
          title={`Encerrar o ciclo de ${label}?`}
          description="Os números finais e o escopo vigente ficam gravados num retrato do ciclo. Mudanças futuras no plano ou na classificação das peças não alteram esse histórico. Você pode reabrir com justificativa."
          confirmLabel="Encerrar ciclo"
          successMessage="Ciclo encerrado."
          destructive={false}
          action={() => api.closeCycle(clientId, cycleId)}
        />
      </>
    );
  }
  return (
    <ReasonDialog
      trigger={
        <Button variant="outline" size="sm" aria-label={`Reabrir ciclo de ${label}`}>
          Reabrir ciclo
        </Button>
      }
      title={`Reabrir o ciclo de ${label}`}
      description="A reabertura fica registrada na auditoria com a sua justificativa."
      submitLabel="Reabrir ciclo"
      successMessage="Ciclo reaberto."
      run={(reason) => api.reopenCycle(clientId, cycleId, reason)}
    />
  );
}
