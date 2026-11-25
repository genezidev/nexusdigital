/** Link para uma tela de agencia mantendo o cliente-alvo (`?client=`) e filtros opcionais. */
export function adminHref(path: string, clientId: string | undefined, params: Record<string, string | number | undefined> = {}): string {
  const qs = new URLSearchParams();
  if (clientId) qs.set("client", clientId);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
