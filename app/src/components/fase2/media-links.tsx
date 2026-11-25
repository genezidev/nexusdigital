"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink as ExternalIcon, Link2, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { Field, FormError } from "@/components/app/field";
import { applyApiError } from "@/components/app/form-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError, api, type Scope } from "@/lib/api/client";
import { mediaLinkForm } from "@/lib/forms-fase2";
import { MEDIA_KIND_LABEL } from "@/lib/labels";
import { serviceLabel } from "@/server/domain/media-link";

export interface MediaLinkItem {
  id: string;
  label: string;
  url: string;
  host: string;
  kind: string;
  /** Texto extra (ex.: "Versao 2"). */
  note?: string;
  /** Mostra o botao de remover (o servidor e o banco conferem de novo). */
  removable?: boolean;
}

/** So https vira link clicavel: a tela reconfere mesmo depois do servidor (nada de javascript:, data:, http:). */
function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/**
 * Aviso da tela de cadastro. No portal, a pessoa e a que vai deixar o arquivo aberto para a agencia (texto combinado
 * com o dono). Na agencia, quem vai abrir e o cliente, entao a mesma regra vale ao contrario.
 */
export function MediaLinkNotice({ audience }: { audience: "portal" | "admin" }) {
  return (
    <p className="text-sm text-muted-foreground" data-testid="media-link-notice">
      {audience === "portal"
        ? "Deixe o arquivo com acesso “qualquer pessoa com o link” para a agência conseguir abrir."
        : "Deixe o arquivo com acesso “qualquer pessoa com o link” para o cliente conseguir abrir."}{" "}
      O sistema não baixa nem mostra o conteúdo: o link abre em outra aba.
    </p>
  );
}

/** Lista de links. Cada um abre em nova aba (`noopener noreferrer nofollow`), sem iframe, sem previa e mostrando o dominio. */
export function MediaLinkList({ scope, items, emptyText = "Nenhum link de mídia cadastrado." }: { scope: Scope; items: MediaLinkItem[]; emptyText?: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  async function remove(item: MediaLinkItem) {
    setBusyId(item.id);
    try {
      await api.deleteMediaLink(scope, item.id);
      toast.success("Link removido.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Não foi possível remover o link.");
    } finally {
      setBusyId(null);
    }
  }
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link2 className="size-4" aria-hidden="true" /> {emptyText}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="Links de mídia">
      {items.map((item) => {
        const href = safeHref(item.url);
        return (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3" data-testid="media-link-item">
            <div className="min-w-0">
              <p className="font-medium break-words">{item.label}</p>
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">{MEDIA_KIND_LABEL[item.kind] ?? item.kind}</Badge>
                {item.note ? <span>{item.note}</span> : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex min-h-11 items-center gap-1 break-all font-medium text-primary underline underline-offset-4"
                >
                  Abrir no {serviceLabel(item.host)} <span className="font-normal text-muted-foreground">({item.host})</span>
                  <ExternalIcon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="sr-only">(abre em nova aba)</span>
                </a>
              ) : (
                <span className="text-muted-foreground">Link não clicável</span>
              )}
              {item.removable ? (
                <Button variant="ghost" size="sm" disabled={busyId === item.id} onClick={() => void remove(item)} aria-label={`Remover o link ${item.label}`}>
                  <Trash2 aria-hidden="true" /> Remover
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type Values = z.input<typeof mediaLinkForm>;
export type MediaTargetProp = { versionId: string } | { scriptId: string } | { recordingId: string };

/** Cadastro do link: titulo curto, endereco e tipo. A validacao que vale e a do servidor (https e lista de servicos). */
export function MediaLinkForm({ scope, target, audience, buttonLabel = "Adicionar link" }: { scope: Scope; target: MediaTargetProp; audience: "portal" | "admin"; buttonLabel?: string }) {
  const router = useRouter();
  const id = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, z.output<typeof mediaLinkForm>>({ resolver: zodResolver(mediaLinkForm), defaultValues: { label: "", url: "", kind: "VIDEO" } });

  async function onSubmit(v: z.output<typeof mediaLinkForm>) {
    setFormError(null);
    try {
      await api.createMediaLink(scope, { ...v, ...target });
      toast.success("Link adicionado.");
      reset({ label: "", url: "", kind: v.kind });
      router.refresh();
    } catch (error) {
      applyApiError<Values>(error, { setError, fieldMap: { label: "label", url: "url", kind: "kind" }, setFormError, fallback: "Não foi possível adicionar o link." });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-3" aria-label="Adicionar link de mídia" data-testid="media-link-form">
      <MediaLinkNotice audience={audience} />
      <FormError message={formError} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`${id}-label`} label="Título curto" error={errors.label?.message}>
          <Input id={`${id}-label`} autoComplete="off" maxLength={120} aria-invalid={errors.label ? true : undefined} {...register("label")} />
        </Field>
        <Field id={`${id}-kind`} label="Tipo" error={errors.kind?.message}>
          <NativeSelect id={`${id}-kind`} {...register("kind")}>
            {Object.entries(MEDIA_KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <Field id={`${id}-url`} label="Link da mídia" error={errors.url?.message} hint="Comece com https://. Aceitamos Google Drive, YouTube, Vimeo, Dropbox, OneDrive, Canva, Figma, WeTransfer e Instagram.">
        <Input id={`${id}-url`} type="url" inputMode="url" autoComplete="off" aria-invalid={errors.url ? true : undefined} aria-describedby={`${id}-url-hint`} {...register("url")} />
      </Field>
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Link2 aria-hidden="true" />}
          {buttonLabel}
        </Button>
      </div>
    </form>
  );
}
