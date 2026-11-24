// Fusos do Brasil oferecidos no cadastro de cliente. O padrao e America/Maceio (DESIGN.md e especificacao mestre).
export const DEFAULT_TIMEZONE = "America/Maceio";

export const TIMEZONES = [
  { value: "America/Maceio", label: "Maceió (UTC-3)" },
  { value: "America/Sao_Paulo", label: "São Paulo, Brasília (UTC-3)" },
  { value: "America/Bahia", label: "Salvador (UTC-3)" },
  { value: "America/Fortaleza", label: "Fortaleza (UTC-3)" },
  { value: "America/Recife", label: "Recife (UTC-3)" },
  { value: "America/Belem", label: "Belém (UTC-3)" },
  { value: "America/Manaus", label: "Manaus (UTC-4)" },
  { value: "America/Cuiaba", label: "Cuiabá (UTC-4)" },
  { value: "America/Campo_Grande", label: "Campo Grande (UTC-4)" },
  { value: "America/Porto_Velho", label: "Porto Velho (UTC-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco (UTC-5)" },
  { value: "America/Noronha", label: "Fernando de Noronha (UTC-2)" },
] as const;

export const TIMEZONE_VALUES = TIMEZONES.map((t) => t.value) as [string, ...string[]];
