"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Field, describedBy } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";
import { applyApiError } from "@/components/app/form-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { planForm, planVersionForm } from "@/lib/forms-fase2";

export interface PlanDefaults {
  code?: string;
  name: string;
  amountText: string;
  quota: number;
  revisions: number;
  deadline: number;
  scope: string;
  exclusions: string;
}

const EMPTY: PlanDefaults = { code: "", name: "", amountText: "", quota: 12, revisions: 2, deadline: 3, scope: "", exclusions: "" };

type Values = z.input<typeof planForm>;
const FIELD_MAP = {
  code: "code",
  name: "name",
  monthlyAmountCents: "amount",
  monthlyQuota: "quota",
  revisionsPerPiece: "revisions",
  approvalDeadlineBusinessDays: "deadline",
  scope: "scope",
  exclusions: "exclusions",
} as const;

/** Cria um plano novo (catalogo) ou uma NOVA VERSAO de um plano: plano publicado nunca e editado no lugar. */
export function PlanFormDialog({ mode, planId, defaults }: { mode: "create" | "version"; planId?: string; defaults?: PlanDefaults }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const d = defaults ?? EMPTY;
  const schema = mode === "create" ? planForm : planVersionForm;
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, z.output<typeof planForm>>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      code: d.code ?? "",
      name: d.name,
      amount: d.amountText,
      quota: String(d.quota),
      revisions: String(d.revisions),
      deadline: String(d.deadline),
      scope: d.scope,
      exclusions: d.exclusions,
    },
  });

  async function onSubmit(v: z.output<typeof planForm>) {
    setFormError(null);
    const body = {
      name: v.name,
      monthlyAmountCents: v.amount,
      monthlyQuota: v.quota,
      revisionsPerPiece: v.revisions,
      approvalDeadlineBusinessDays: v.deadline,
      scope: v.scope,
      exclusions: v.exclusions,
    };
    try {
      if (mode === "create") await api.createPlan({ code: v.code, ...body });
      else await api.createPlanVersion(planId!, body);
      toast.success(mode === "create" ? `Plano "${v.name}" criado.` : "Nova versão do plano criada. Assinaturas existentes continuam com a versão contratada.");
      setOpen(false);
      reset();
      router.refresh();
    } catch (error) {
      applyApiError<Values>(error, { setError, fieldMap: FIELD_MAP, setFormError, fallback: "Não foi possível salvar o plano. Tente novamente." });
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
        mode === "create" ? (
          <Button>
            <Plus aria-hidden="true" /> Novo plano
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            Nova versão
          </Button>
        )
      }
      title={mode === "create" ? "Novo plano" : "Nova versão do plano"}
      description={
        mode === "create"
          ? "Plano do catálogo da agência. Depois de publicado, ele não é editado: mudanças viram uma nova versão."
          : "A versão anterior continua valendo para as assinaturas que já a contrataram."
      }
      submitLabel={mode === "create" ? "Criar plano" : "Criar nova versão"}
      busyLabel="Salvando…"
      submitting={isSubmitting}
      formError={formError}
      onSubmit={handleSubmit(onSubmit)}
      wide
    >
      {mode === "create" ? (
        <Field id="plan-code" label="Código do plano" error={errors.code?.message} hint="Letras minúsculas, números e hífen. Não muda depois.">
          <Input id="plan-code" autoComplete="off" aria-invalid={errors.code ? true : undefined} aria-describedby={describedBy("plan-code", errors.code?.message, "x")} {...register("code")} />
        </Field>
      ) : null}
      <Field id="plan-name" label="Nome do plano" error={errors.name?.message}>
        <Input id="plan-name" autoComplete="off" aria-invalid={errors.name ? true : undefined} {...register("name")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="plan-amount" label="Valor mensal (R$)" error={errors.amount?.message} hint="Exemplo: 1.200,00">
          <Input id="plan-amount" inputMode="decimal" autoComplete="off" aria-invalid={errors.amount ? true : undefined} aria-describedby={describedBy("plan-amount", errors.amount?.message, "x")} {...register("amount")} />
        </Field>
        <Field id="plan-quota" label="Cota de publicações por mês" error={errors.quota?.message}>
          <Input id="plan-quota" inputMode="numeric" autoComplete="off" aria-invalid={errors.quota ? true : undefined} {...register("quota")} />
        </Field>
        <Field id="plan-revisions" label="Revisões por peça" error={errors.revisions?.message}>
          <Input id="plan-revisions" inputMode="numeric" autoComplete="off" aria-invalid={errors.revisions ? true : undefined} {...register("revisions")} />
        </Field>
        <Field id="plan-deadline" label="Prazo de aprovação (dias úteis)" error={errors.deadline?.message}>
          <Input id="plan-deadline" inputMode="numeric" autoComplete="off" aria-invalid={errors.deadline ? true : undefined} {...register("deadline")} />
        </Field>
      </div>
      <Field id="plan-scope" label="Escopo (o que está incluído)" error={errors.scope?.message}>
        <Textarea id="plan-scope" rows={4} aria-invalid={errors.scope ? true : undefined} {...register("scope")} />
      </Field>
      <Field id="plan-exclusions" label="Exclusões (o que não está incluído)" error={errors.exclusions?.message}>
        <Textarea id="plan-exclusions" rows={3} aria-invalid={errors.exclusions ? true : undefined} {...register("exclusions")} />
      </Field>
    </FormDialog>
  );
}

export function DeactivatePlanButton({ planId, name }: { planId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Desativar o plano ${name}`}>
        Desativar
      </Button>
      <ConfirmAction
        open={open}
        onOpenChange={setOpen}
        title={`Desativar o plano "${name}"?`}
        description="O plano deixa de poder ser escolhido em novas assinaturas. As assinaturas que já o contrataram não mudam."
        confirmLabel="Desativar plano"
        successMessage="Plano desativado."
        action={() => api.deactivatePlan(planId)}
      />
    </>
  );
}
