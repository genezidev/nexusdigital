// Datas no padrao do produto: DD/MM/AAAA, fuso padrao America/Maceio (DESIGN.md).
const DEFAULT_TZ = "America/Maceio";

function parts(date: Date | string, timeZone: string, withTime: boolean): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "N/D";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  })
    .format(d)
    .replace(",", "");
}

export const formatDate = (date: Date | string, timeZone: string = DEFAULT_TZ) => parts(date, timeZone, false);
export const formatDateTime = (date: Date | string, timeZone: string = DEFAULT_TZ) => parts(date, timeZone, true);
