"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api/client";
import { parseLines, scriptForm } from "@/lib/forms-fase2";

type Values = z.input<typeof scriptForm>;
export interface ScriptDefaults {
  title: string;
  objective: string;
  plannedDurationSeconds: string;
  deadlineOn: string;
  location: string;
  equipment: string;
  audioNotes: string;
  lightNotes: string;
  framingNotes: string;
  referenceLinks: string;
  assigneeId: string;
  contentId: string;
  scenes: { dialogue: string; action: string; durationSeconds: string }[];
}

const EMPTY: ScriptDefaults = {
  title: "",
  objective: "",
  plannedDurationSeconds: "",
  deadlineOn: "",
  location: "",
  equipment: "",
  audioNotes: "",
  lightNotes: "",
  framingNotes: "",
  referenceLinks: "",
  assigneeId: "",
  contentId: "",
  scenes: [{ dialogue: "", action: "", durationSeconds: "" }],
};

/** Cria ou edita (so em rascunho) o roteiro com cenas ordenadas, instrucoes, responsavel e prazo. */
export function ScriptFormDialog({
  clientId,
  scriptId,
  defaults,
  assignees,
  contents,
}: {
  clientId: string;
  scriptId?: string;
  defaults?: ScriptDefaults;
  assignees: { id: string; name: string }[];
  contents: { id: string; title: string }[];
}) {
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
  } = useForm<Values, unknown, z.output<typeof scriptForm>>({ resolver: zodResolver(scriptForm), defaultValues: defaults ?? EMPTY });
  const { fields, append, remove } = useFieldArray({ control, name: "scenes" });

  async function onSubmit(v: z.output<typeof scriptForm>) {
    setFormError(null);
    const body = {
      title: v.title,
      objective: v.objective || null,
      plannedDurationSeconds: v.plannedDurationSeconds ?? null,
      deadlineOn: v.deadlineOn || null,
      location: v.location || null,
      equipment: v.equipment || null,
      audioNotes: v.audioNotes || null,
      lightNotes: v.lightNotes || null,
      framingNotes: v.framingNotes || null,
      referenceLinks: parseLines(v.referenceLinks),
      assigneeId: v.assigneeId || null,
      contentId: v.contentId || null,
      scenes: v.scenes
        .filter((s) => s.dialogue || s.action)
        .map((s) => ({ dialogue: s.dialogue || undefined, action: s.action || undefined, durationSeconds: s.durationSeconds })),
    };
    try {
      if (scriptId) await api.patchScript(clientId, scriptId, body);
      else {
        const created = await api.createScript(clientId, body);
        router.push(`/admin/scripts/${created.id}?client=${clientId}`);
      }
      toast.success(scriptId ? "Roteiro salvo." : `Roteiro "${v.title}" criado.`);
      setOpen(false);
      if (!scriptId) reset();
      router.refresh();
    } catch (error) {
      applyApiError<Values>(error, { setError, fieldMap: { title: "title", referenceLinks: "referenceLinks" }, setFormError, fallback: "Não foi possível salvar o roteiro." });
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(n) => {
        setOpen(n);
        if (!n) setFormError(null);
      }}
      trigger={
        scriptId ? (
          <Button variant="outline">Editar roteiro</Button>
        ) : (
          <Button>
            <Plus aria-hidden="true" /> Novo roteiro
          </Button>
        )
      }
      title={scriptId ? "Editar roteiro" : "Novo roteiro"}
      description="O roteiro nasce como rascunho (só a agência vê). Enquanto for rascunho você edita tudo; depois de enviado ao cliente, ele só lê."
      submitLabel={scriptId ? "Salvar roteiro" : "Criar roteiro"}
      submitting={isSubmitting}
      formError={formError}
      onSubmit={handleSubmit(onSubmit)}
      wide
    >
      <Field id="sc-title" label="Título" error={errors.title?.message}>
        <Input id="sc-title" autoComplete="off" aria-invalid={errors.title ? true : undefined} {...register("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="sc-assignee" label="Responsável (equipe)">
          <NativeSelect id="sc-assignee" {...register("assigneeId")}>
            <option value="">Sem responsável</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="sc-deadline" label="Prazo da gravação" error={errors.deadlineOn?.message}>
          <Input id="sc-deadline" type="date" {...register("deadlineOn")} />
        </Field>
        <Field id="sc-content" label="Ligado à peça (opcional)">
          <NativeSelect id="sc-content" {...register("contentId")}>
            <option value="">Sem ligação</option>
            {contents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field id="sc-duration" label="Duração prevista (segundos)" error={errors.plannedDurationSeconds?.message}>
          <Input id="sc-duration" inputMode="numeric" {...register("plannedDurationSeconds")} />
        </Field>
      </div>
      <Field id="sc-objective" label="Objetivo" error={errors.objective?.message}>
        <Textarea id="sc-objective" rows={2} {...register("objective")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="sc-location" label="Local">
          <Input id="sc-location" autoComplete="off" {...register("location")} />
        </Field>
        <Field id="sc-equipment" label="Equipamento">
          <Input id="sc-equipment" autoComplete="off" {...register("equipment")} />
        </Field>
      </div>
      <p className="text-sm text-muted-foreground">Formato vertical 9:16.</p>
      <Field id="sc-audio" label="Instruções de áudio">
        <Textarea id="sc-audio" rows={2} {...register("audioNotes")} />
      </Field>
      <Field id="sc-light" label="Instruções de luz">
        <Textarea id="sc-light" rows={2} {...register("lightNotes")} />
      </Field>
      <Field id="sc-framing" label="Instruções de enquadramento">
        <Textarea id="sc-framing" rows={2} {...register("framingNotes")} />
      </Field>
      <Field id="sc-refs" label="Referências (um link https:// por linha)" error={errors.referenceLinks?.message}>
        <Textarea id="sc-refs" rows={2} {...register("referenceLinks")} />
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">Cenas (na ordem em que serão gravadas)</legend>
        {fields.map((f, i) => (
          <div key={f.id} className="flex flex-col gap-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Cena {i + 1}</p>
            <Field id={`sc-d-${i}`} label={`Fala da cena ${i + 1}`}>
              <Textarea id={`sc-d-${i}`} rows={2} {...register(`scenes.${i}.dialogue`)} />
            </Field>
            <Field id={`sc-a-${i}`} label={`Ação da cena ${i + 1}`}>
              <Textarea id={`sc-a-${i}`} rows={2} {...register(`scenes.${i}.action`)} />
            </Field>
            <Field id={`sc-s-${i}`} label={`Duração da cena ${i + 1} (segundos)`} error={errors.scenes?.[i]?.durationSeconds?.message}>
              <Input id={`sc-s-${i}`} inputMode="numeric" {...register(`scenes.${i}.durationSeconds`)} />
            </Field>
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)} aria-label={`Remover a cena ${i + 1}`}>
                <Trash2 aria-hidden="true" /> Remover cena
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" onClick={() => append({ dialogue: "", action: "", durationSeconds: "" })}>
            <Plus aria-hidden="true" /> Adicionar cena
          </Button>
        </div>
      </fieldset>
    </FormDialog>
  );
}

const FORWARD_LABEL: Record<string, string> = {
  ENVIADO: "Enviar ao cliente",
  AGUARDANDO_GRAVACAO: "Liberar para gravação",
  EM_EDICAO: "Iniciar edição",
  AGUARDANDO_APROVACAO: "Enviar para aprovação",
  FINALIZADO: "Marcar como finalizado",
  PUBLICADO: "Marcar como publicado",
};

/** So as transicoes permitidas pela maquina de estados do roteiro (calculadas na pagina). */
export function ScriptStatusPanel({ clientId, scriptId, targets }: { clientId: string; scriptId: string; targets: string[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function move(to: string) {
    setBusy(true);
    try {
      await api.setScriptStatus(clientId, scriptId, { to });
      toast.success("Status do roteiro atualizado.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível mudar o status.");
    } finally {
      setBusy(false);
      setPending(null);
    }
  }
  if (targets.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma ação de status disponível agora.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {targets.map((t) => (
        <Button key={t} variant={t === "ENVIADO" ? "default" : "outline"} disabled={busy} onClick={() => (t === "ENVIADO" ? setPending(t) : void move(t))}>
          {FORWARD_LABEL[t] ?? t}
        </Button>
      ))}
      <ConfirmAction
        open={pending === "ENVIADO"}
        onOpenChange={(o) => !o && setPending(null)}
        title="Enviar o roteiro ao cliente?"
        description="O cliente passa a ver o roteiro e suas instruções. Depois de enviado, o roteiro não é mais editado."
        confirmLabel="Enviar ao cliente"
        successMessage="Roteiro enviado ao cliente."
        destructive={false}
        action={() => api.setScriptStatus(clientId, scriptId, { to: "ENVIADO" })}
      />
    </div>
  );
}

export function RecordingReviewActions({ clientId, recordingId }: { clientId: string; recordingId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setOpen(true)}>Confirmar recebimento</Button>
      <ConfirmAction
        open={open}
        onOpenChange={setOpen}
        title="Confirmar o recebimento da gravação?"
        description="O roteiro passa para “Gravação recebida”. A confirmação fica registrada com o seu nome e o horário."
        confirmLabel="Confirmar recebimento"
        successMessage="Gravação confirmada."
        destructive={false}
        action={() => api.confirmRecording(clientId, recordingId)}
      />
      <ReasonDialog
        trigger={<Button variant="outline">Pedir regravação</Button>}
        title="Pedir regravação"
        description="A justificativa fica visível ao cliente, e o roteiro volta a aguardar gravação."
        submitLabel="Pedir regravação"
        successMessage="Regravação solicitada."
        run={(justification) => api.requestRerecording(clientId, recordingId, justification)}
      />
    </div>
  );
}
