/** Formata centavos inteiros em reais (pt-BR). Dinheiro nunca usa decimal. */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("Valor em centavos precisa ser um inteiro seguro");
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/** Variação percentual entre períodos; N/D (null) quando o anterior não é positivo. */
export function percentChange(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return ((current - previous) / previous) * 100;
}
