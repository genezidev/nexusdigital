"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Field, FormError, describedBy } from "@/components/app/field";
import { FormDialog } from "@/components/app/form-dialog";
import { applyApiError } from "@/components/app/form-utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { contentForm, materialForm, parseHashtags, planningForm } from "@/lib/forms-fase2";
import { CHANNEL_LABEL, FORMAT_LABEL } from "@/lib/labels";

export interface CycleOption {
  id: string;
  label: string;
}
export interface AssigneeOption {
  id: string;
  name: string;
}

const FORMATS = Object.entries(FORMAT_LABEL);
const CHANNELS = Object.entries(CHANNEL_LABEL);

type ContentValues = z.input<typeof contentForm>;

export function NewContentDialog({ clientId, cycles, assignees, defaultCycleId }: { clientId: string; cycles: CycleOption[]; assignees: AssigneeOption[]; defaultCycleId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ContentValues, unknown, z.output<typeof contentForm>>({
    resolver: zodResolver(contentForm),
    defaultValues: { cycleId: defaultCycleId ?? cycles[0]?.id ?? "", title: "", format: "ARTE", channel: "INSTAGRAM", plannedOn: "", pillar: "", objective: "", description: "", assigneeId: "", countsTowardQuota: true },
  });

  async function onSubmit(v: z.output<typeof contentForm>) {
    setFormError(null);
    try {
      const created = await api.createContent(clientId, {
        cycleId: v.cycleId,
        title: v.title,
        format: v.format,
        channel: v.channel,
        plannedOn: v.plannedOn,
        description: v.description || undefined,
        objective: v.objective || undefined,
        pillar: v.pillar || undefined,
        assigneeId: v.assigneeId || undefined,
        countsTowardQuota: v.countsTowardQuota,
      });
      toast.success(`Peça "${v.title}" planejada.`);
      setOpen(false);
      reset();
      router.push(`/admin/contents/${created.id}?client=${clientId}`);
      router.refresh();
    } catch (error) {
      applyApiError<ContentValues>(error, {
        setError,
        fieldMap: { cycleId: "cycleId", title: "title", format: "format", channel: "channel", plannedOn: "plannedOn", description: "description", objective: "objective", pillar: "pillar", assigneeId: "assigneeId" },
        setFormError,
        fallback: "Não foi possível criar a peça. Tente novamente.",
      });
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
        <Button disabled={cycles.length === 0} title={cycles.length === 0 ? "Abra um ciclo antes de planejar peças" : undefined}>
          <Plus aria-hidden="true" /> Nova peça
        </Button>
      }
      title="Nova peça"
      description="Planeje a peça no ciclo do mês. O conteúdo nasce interno: o cliente só vê depois que você compartilhar."
      submitLabel="Criar peça"
      busyLabel="Criando…"
      submitting={isSubmitting}
      formError={formError}
      onSubmit={handleSubmit(onSubmit)}
      wide
    >
      <Field id="content-title" label="Título" error={errors.title?.message}>
        <Input id="content-title" autoComplete="off" aria-invalid={errors.title ? true : undefined} {...register("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="content-cycle" label="Ciclo" error={errors.cycleId?.message}>
          <NativeSelect id="content-cycle" aria-invalid={errors.cycleId ? true : undefined} {...register("cycleId")}>
            <option value="">Escolha o ciclo</option>
            {cycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="content-date" label="Data prevista" error={errors.plannedOn?.message}>
          <Input id="content-date" type="date" aria-invalid={errors.plannedOn ? true : undefined} {...register("plannedOn")} />
        </Field>
        <Field id="content-format" label="Formato" error={errors.format?.message}>
          <NativeSelect
            id="content-format"
            {...register("format", {
              // Story nao conta na cota por padrao (spec); a pessoa ainda pode marcar.
              onChange: (e) => setValue("countsTowardQuota", e.target.value !== "STORY"),
            })}
          >
            {FORMATS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="content-channel" label="Canal" error={errors.channel?.message}>
          <NativeSelect id="content-channel" {...register("channel")}>
            {CHANNELS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="flex items-start gap-3">
        <input id="content-counts" type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" {...register("countsTowardQuota")} />
        <label htmlFor="content-counts" className="text-sm">
          Conta na cota mensal (Stories não contam por padrão)
        </label>
      </div>
      <Field id="content-assignee" label="Responsável (opcional)">
        <NativeSelect id="content-assignee" {...register("assigneeId")}>
          <option value="">Sem responsável</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="content-pillar" label="Pilar (opcional)" error={errors.pillar?.message}>
        <Input id="content-pillar" autoComplete="off" {...register("pillar")} />
      </Field>
      <Field id="content-objective" label="Objetivo (opcional, interno)" error={errors.objective?.message}>
        <Textarea id="content-objective" rows={2} {...register("objective")} />
      </Field>
      <Field id="content-description" label="Descrição (opcional)" error={errors.description?.message}>
        <Textarea id="content-description" rows={3} {...register("description")} />
      </Field>
    </FormDialog>
  );
}

// ---------- planejamento (nao invalida aprovacao) ----------

type PlanningValues = z.input<typeof planningForm>;

export function PlanningForm({
  clientId,
  contentId,
  initial,
  assignees,
}: {
  clientId: string;
  contentId: string;
  initial: { title: string; description: string; pillar: string; objective: string; internalNotes: string; assigneeId: string; assigneeVisibleToClient: boolean };
  assignees: AssigneeOption[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<PlanningValues, unknown, z.output<typeof planningForm>>({ resolver: zodResolver(planningForm), defaultValues: initial });

  async function onSubmit(v: z.output<typeof planningForm>) {
    setFormError(null);
    try {
      await api.patchPlanning(clientId, contentId, {
        title: v.title,
        description: v.description || null,
        pillar: v.pillar || null,
        objective: v.objective || null,
        internalNotes: v.internalNotes || null,
        assigneeId: v.assigneeId || null,
        assigneeVisibleToClient: v.assigneeVisibleToClient,
      });
      toast.success("Planejamento salvo. A aprovação não foi afetada.");
      router.refresh();
    } catch (error) {
      applyApiError<PlanningValues>(error, { setError, fieldMap: { title: "title", description: "description", pillar: "pillar", objective: "objective", internalNotes: "internalNotes", assigneeId: "assigneeId" }, setFormError, fallback: "Não foi possível salvar o planejamento." });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4" aria-label="Planejamento da peça">
      <FormError message={formError} />
      <Field id="plan-title" label="Título" error={errors.title?.message}>
        <Input id="plan-title" autoComplete="off" aria-invalid={errors.title ? true : undefined} {...register("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="plan-pillar" label="Pilar" error={errors.pillar?.message}>
          <Input id="plan-pillar" autoComplete="off" {...register("pillar")} />
        </Field>
        <Field id="plan-assignee" label="Responsável">
          <NativeSelect id="plan-assignee" {...register("assigneeId")}>
            <option value="">Sem responsável</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="flex items-start gap-3">
        <input id="plan-assignee-visible" type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" {...register("assigneeVisibleToClient")} />
        <label htmlFor="plan-assignee-visible" className="text-sm">
          Mostrar o nome do responsável ao cliente
        </label>
      </div>
      <Field id="plan-objective" label="Objetivo (interno)" error={errors.objective?.message}>
        <Textarea id="plan-objective" rows={2} {...register("objective")} />
      </Field>
      <Field id="plan-description" label="Descrição" error={errors.description?.message}>
        <Textarea id="plan-description" rows={3} {...register("description")} />
      </Field>
      <Field id="plan-notes" label="Notas internas (nunca aparecem para o cliente)" error={errors.internalNotes?.message}>
        <Textarea id="plan-notes" rows={3} {...register("internalNotes")} />
      </Field>
      <div>
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Salvar planejamento
        </Button>
      </div>
    </form>
  );
}

// ---------- material (versao) ----------

type MaterialValues = z.input<typeof materialForm>;

export function MaterialEditor({
  clientId,
  contentId,
  status,
  currentVersionId,
  initial,
  format,
  channel,
  hasDraft,
}: {
  clientId: string;
  contentId: string;
  status: string;
  /** Versao atual ENVIADA (ou null): enviada junto para o servidor recusar edicao sobre versao desatualizada. */
  currentVersionId: string | null;
  initial: { caption: string; cta: string; hashtags: string; briefing: string };
  format: string;
  channel: string;
  hasDraft: boolean;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [fmt, setFmt] = useState(format);
  const [chan, setChan] = useState(channel);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MaterialValues, unknown, z.output<typeof materialForm>>({ resolver: zodResolver(materialForm), defaultValues: initial });

  // Depois do envio, salvar cria NOVA versao ja enviada (e invalida a aprovacao, se havia).
  const newVersionMode = status === "AGUARDANDO_APROVACAO" || status === "APROVADO" || status === "AGENDADO";
  const invalidates = status === "APROVADO" || status === "AGENDADO";

  async function onSubmit(v: z.output<typeof materialForm>) {
    setFormError(null);
    try {
      await api.saveMaterial(clientId, contentId, {
        caption: v.caption || null,
        cta: v.cta || null,
        hashtags: parseHashtags(v.hashtags),
        briefing: v.briefing || null,
        ...(fmt !== format ? { format: fmt as never } : {}),
        ...(chan !== channel ? { channel: chan as never } : {}),
        expectedVersionId: currentVersionId,
      });
      toast.success(newVersionMode ? (invalidates ? "Nova versão enviada. A aprovação anterior foi invalidada e a peça voltou para a fila do cliente." : "Nova versão enviada ao cliente.") : "Rascunho salvo.");
      router.refresh();
    } catch (error) {
      applyApiError<MaterialValues>(error, { setError, fieldMap: { caption: "caption", cta: "cta", briefing: "briefing" }, setFormError, fallback: "Não foi possível salvar o material." });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4" aria-label="Material da peça">
      {newVersionMode ? (
        <Alert variant={invalidates ? "destructive" : "default"}>
          <AlertDescription>
            {invalidates
              ? "Esta peça já foi aprovada. Salvar qualquer mudança de legenda, CTA, hashtags, formato ou canal cria uma NOVA versão, invalida a aprovação anterior e devolve a peça para a fila do cliente."
              : "A versão atual já está com o cliente. Salvar cria uma nova versão e substitui a que está aguardando decisão."}
          </AlertDescription>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground">{hasDraft ? "Rascunho em edição: só a agência vê até enviar para aprovação." : "Salve para criar o rascunho da primeira versão. Só a agência vê o rascunho."}</p>
      )}
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="mat-format" label="Formato">
          <NativeSelect id="mat-format" value={fmt} onChange={(e) => setFmt(e.target.value)}>
            {FORMATS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="mat-channel" label="Canal">
          <NativeSelect id="mat-channel" value={chan} onChange={(e) => setChan(e.target.value)}>
            {CHANNELS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field id="mat-caption" label="Legenda" error={errors.caption?.message}>
        <Textarea id="mat-caption" rows={5} aria-invalid={errors.caption ? true : undefined} {...register("caption")} />
      </Field>
      <Field id="mat-cta" label="Chamada para ação (CTA)" error={errors.cta?.message}>
        <Input id="mat-cta" autoComplete="off" aria-invalid={errors.cta ? true : undefined} {...register("cta")} />
      </Field>
      <Field id="mat-hashtags" label="Hashtags" error={errors.hashtags?.message} hint="Separe por espaço ou vírgula.">
        <Input id="mat-hashtags" autoComplete="off" aria-describedby={describedBy("mat-hashtags", errors.hashtags?.message, "x")} {...register("hashtags")} />
      </Field>
      <Field id="mat-briefing" label="Briefing (interno, nunca aparece para o cliente)" error={errors.briefing?.message}>
        <Textarea id="mat-briefing" rows={3} {...register("briefing")} />
      </Field>
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {newVersionMode ? (invalidates ? "Salvar como nova versão (invalida a aprovação)" : "Salvar como nova versão") : "Salvar rascunho"}
        </Button>
      </div>
    </form>
  );
}
