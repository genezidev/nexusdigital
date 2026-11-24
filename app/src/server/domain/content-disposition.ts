// Content-Disposition seguro para download. SEMPRE attachment. O nome original so serve para exibicao:
// aqui ele e limpo (sem controle, sem barras, sem aspas, sem inversao de texto) e codificado (RFC 6266/5987).

const MAX_NAME = 120;

/** Nome exibivel: sem caracteres de controle, de inversao de texto, separadores de caminho, aspas ou ponto e virgula. */
export function sanitizeDisplayName(raw: string): string {
  const cleaned = raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu, "")
    .replace(/[\/:*?"<>|;%]/g, "_")
    .replace(/^[.\s]+/, "")
    .trim();
  const name = cleaned.slice(0, MAX_NAME);
  return name.length > 0 ? name : "arquivo";
}

const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, "_");

/** `attachment; filename="<ascii>"; filename*=UTF-8''<percent>` (so isso; nunca inline). */
export function attachmentDisposition(originalName: string): string {
  const name = sanitizeDisplayName(originalName);
  const star = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii(name).replace(/"/g, "_")}"; filename*=UTF-8''${star}`;
}
