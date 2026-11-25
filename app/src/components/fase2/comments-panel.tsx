"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Field, FormError } from "@/components/app/field";
import { applyApiError } from "@/components/app/form-utils";
import { VisibilityBadge } from "@/components/app/status-badges";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { api, type Scope } from "@/lib/api/client";
import { formatDateTime } from "@/lib/formatting/date";
import { commentForm } from "@/lib/forms-fase2";

export interface CommentItem {
  id: string;
  body: string;
  visibility: string;
  createdAt: string;
  authorName: string;
}

type Values = z.input<typeof commentForm>;

/**
 * Comentarios do conteudo ou do roteiro. A agencia escolhe interno ou compartilhado (padrao interno); o cliente so
 * cria compartilhado (e nunca ve os internos: eles nem chegam ate a tela). Comentario nao se edita nem se apaga.
 */
export function CommentsPanel({
  scope,
  target,
  targetId,
  comments,
  canComment,
  agency,
  timeZone,
  versionId,
}: {
  scope: Scope;
  target: "content" | "script";
  targetId: string;
  comments: CommentItem[];
  canComment: boolean;
  agency: boolean;
  timeZone: string;
  versionId?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, z.output<typeof commentForm>>({ resolver: zodResolver(commentForm), defaultValues: { body: "", visibility: agency ? "INTERNO" : "COMPARTILHADO" } });

  async function onSubmit(v: z.output<typeof commentForm>) {
    setFormError(null);
    try {
      const visibility = agency ? v.visibility : "COMPARTILHADO";
      if (target === "content") await api.addContentComment(scope, targetId, { body: v.body, visibility, versionId });
      else await api.addScriptComment(scope, targetId, { body: v.body, visibility });
      toast.success("Comentário enviado.");
      reset({ body: "", visibility: agency ? v.visibility : "COMPARTILHADO" });
      router.refresh();
    } catch (error) {
      applyApiError<Values>(error, { setError, fieldMap: { body: "body" }, setFormError, fallback: "Não foi possível enviar o comentário." });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {comments.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="size-4" aria-hidden="true" /> Nenhum comentário ainda.
        </p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Comentários">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{c.authorName}</span>
                <time dateTime={c.createdAt} className="text-muted-foreground">
                  {formatDateTime(c.createdAt, timeZone)}
                </time>
                {agency ? <VisibilityBadge visibility={c.visibility} /> : null}
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap break-words">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canComment ? (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3" aria-label="Novo comentário">
          <FormError message={formError} />
          <Field id={`${id}-body`} label="Novo comentário" error={errors.body?.message}>
            <Textarea id={`${id}-body`} rows={3} aria-invalid={errors.body ? true : undefined} {...register("body")} />
          </Field>
          {agency ? (
            <Field id={`${id}-vis`} label="Quem pode ler" hint="Interno: só a agência. Compartilhado: a agência e o cliente.">
              <NativeSelect id={`${id}-vis`} {...register("visibility")}>
                <option value="INTERNO">Interno (só a agência)</option>
                <option value="COMPARTILHADO">Compartilhado com o cliente</option>
              </NativeSelect>
            </Field>
          ) : null}
          <div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Comentar
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
