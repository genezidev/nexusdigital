// Content-Disposition seguro para download. SEMPRE attachment. O nome original so serve para exibicao:
// aqui ele e limpo (sem controle, sem barras normais ou invertidas, sem aspas, sem inversao de texto) e codificado
// (RFC 6266/5987). B-4: a barra invertida escapava a aspa de fechamento do `filename="..."` e quebrava o cabecalho;
// por isso ela sai do nome, o corte de tamanho vem ANTES de montar o cabecalho e nunca parte um par substituto.

const MAX_NAME = 120;

/** Troca partes soltas de um par substituto UTF-16 (que o encodeURIComponent recusaria) por U+FFFD. */
function wellFormed(text: string): string {
  return text.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "\ufffd");
}

/** Corta em ate `max` caracteres Unicode (pontos de codigo), sem separar um emoji ou outro par substituto. */
function truncateByCodePoints(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join("");
}

/** Nome exibivel: sem caracteres de controle, de inversao de texto, separadores de caminho (barra e barra invertida), aspas ou ponto e virgula. */
export function sanitizeDisplayName(raw: string): string {
  const cleaned = wellFormed(raw)
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/gu, "")
    .replace(/[\/\\:*?"<>|;%]/g, "_")
    .replace(/^[.\s]+/, "")
    .trim();
  const name = truncateByCodePoints(cleaned, MAX_NAME).trim();
  return name.length > 0 ? name : "arquivo";
}

// So ASCII imprimivel, e nunca aspas nem barra invertida dentro do texto entre aspas do `filename=`.
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");

/** `attachment; filename="<ascii>"; filename*=UTF-8''<percent>` (so isso; nunca inline). */
export function attachmentDisposition(originalName: string): string {
  const name = sanitizeDisplayName(originalName);
  const star = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii(name)}"; filename*=UTF-8''${star}`;
}
