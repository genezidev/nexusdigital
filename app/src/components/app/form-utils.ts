import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/lib/api/client";

/**
 * Leva o erro da API para o formulario: erro por campo (422) vai junto do campo; o resto vira mensagem do formulario.
 * `fieldMap` traduz o nome do campo da API para o nome do campo da tela (ex.: monthlyQuota -> quota).
 */
export function applyApiError<T extends FieldValues>(
  error: unknown,
  opts: { setError: UseFormSetError<T>; fieldMap?: Record<string, Path<T>>; setFormError: (message: string | null) => void; fallback: string },
): void {
  if (!(error instanceof ApiError)) {
    opts.setFormError(opts.fallback);
    return;
  }
  let mapped = 0;
  for (const [field, message] of Object.entries(error.fields)) {
    const target = opts.fieldMap?.[field];
    if (target) {
      opts.setError(target, { message });
      mapped += 1;
    }
  }
  opts.setFormError(mapped > 0 && error.status === 422 ? null : error.message);
}
