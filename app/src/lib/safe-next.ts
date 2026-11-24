/**
 * Destino pos-login vindo da URL (?next=). So aceita caminho interno: comeca com uma unica "/",
 * sem "//", "\\" ou esquema, e nunca volta para telas publicas ou para a API. Qualquer outra coisa vira "/".
 */
export function safeNext(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw.length > 300) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || /[\u0000-\u001f]/.test(raw)) return "/";
  if (/^\/(login|forgot-password|reset-password|invite|api)(\/|\?|$)/.test(raw)) return "/";
  return raw;
}
