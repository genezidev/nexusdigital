// Validacao PREVIA de arquivo no navegador (conveniencia: evita subir 1 GB para ouvir "nao"). A decisao e SEMPRE
// do servidor (tipo real pelos primeiros bytes, tamanho, extensao); estas listas espelham a politica, nao a substituem.

export type UploadCategory = "IMAGEM" | "DOCUMENTO" | "VIDEO";

const MB = 1024 * 1024;

export interface UploadLimits {
  /** Limite em bytes por categoria, vindo do servidor (variaveis MAX_*_MB). */
  IMAGEM: number;
  DOCUMENTO: number;
  VIDEO: number;
}

const TYPES: Record<string, UploadCategory> = {
  "image/jpeg": "IMAGEM",
  "image/png": "IMAGEM",
  "image/webp": "IMAGEM",
  "application/pdf": "DOCUMENTO",
  "video/mp4": "VIDEO",
  "video/quicktime": "VIDEO",
  "video/webm": "VIDEO",
};

const BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

const BLOCKED = new Set([
  "exe", "msi", "dll", "bat", "cmd", "sh", "ps1", "jar", "apk", "com", "scr", "html", "htm", "svg", "xml", "js", "mjs", "docm", "xlsm", "pptm", "vbs", "php",
]);

export const ACCEPT_BY_CATEGORY: Record<UploadCategory, string> = {
  IMAGEM: ".jpg,.jpeg,.png,.webp",
  DOCUMENTO: ".pdf",
  VIDEO: ".mp4,.mov,.webm",
};

export const FILE_TYPE_HELP = "Imagens JPEG, PNG ou WebP; PDF; vídeos MP4, MOV ou WebM.";

export function formatLimit(bytes: number): string {
  const mb = bytes / MB;
  return mb >= 1024 ? `${(mb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB` : `${mb.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

export function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase().trim();
}

/** Tipo a declarar ao servidor: o do navegador se permitido, senao o deduzido da extensao. */
export function declaredMimeType(file: { name: string; type: string }): string {
  const t = file.type.toLowerCase();
  if (TYPES[t]) return t;
  return BY_EXTENSION[extensionOf(file.name)] ?? (t || "application/octet-stream");
}

/**
 * Devolve a mensagem em pt-BR do primeiro problema, ou null se o arquivo pode ser enviado.
 * `allowed` restringe as categorias (ex.: gravacao aceita so video; roteiro so PDF).
 */
export function validateFileBeforeUpload(
  file: { name: string; type: string; size: number },
  limits: UploadLimits,
  allowed: readonly UploadCategory[] = ["IMAGEM", "DOCUMENTO", "VIDEO"],
): string | null {
  if (file.size <= 0) return "O arquivo está vazio.";
  if (file.name.length > 255) return "O nome do arquivo é longo demais (máximo 255 caracteres).";
  const parts = file.name.toLowerCase().split(".").slice(1);
  if (parts.some((p) => BLOCKED.has(p.trim()))) return "Este tipo de arquivo não é permitido por segurança (executáveis, páginas web, SVG e arquivos com macro).";
  const mime = declaredMimeType(file);
  const category = TYPES[mime];
  if (!category) return `Tipo de arquivo não permitido. ${FILE_TYPE_HELP}`;
  if (!allowed.includes(category)) {
    const names = allowed.map((c) => (c === "IMAGEM" ? "imagem" : c === "VIDEO" ? "vídeo" : "PDF")).join(" ou ");
    return `Neste ponto só é aceito ${names}.`;
  }
  const max = limits[category];
  if (file.size > max) return `O arquivo tem mais que o limite de ${formatLimit(max)} para este tipo.`;
  return null;
}

/** Mensagem pt-BR para a resposta do envio dos bytes (PUT) ou do pedido de alvo. */
export function uploadErrorMessage(status: number, fallback?: string): string {
  switch (status) {
    case 0:
      return "A conexão caiu durante o envio. Nada foi salvo: escolha o arquivo e envie de novo.";
    case 401:
      return "Sua sessão expirou. Entre novamente para enviar.";
    case 403:
      return "Você não tem permissão para enviar arquivos aqui.";
    case 410:
      return "O link de envio venceu. Escolha o arquivo e envie de novo.";
    case 413:
      return "O arquivo é maior que o limite permitido para este tipo.";
    case 415:
      return "O servidor recusou este tipo de arquivo. O conteúdo precisa ser uma imagem, um PDF ou um vídeo permitido.";
    case 422:
      return fallback ?? "O servidor recusou o arquivo: o conteúdo não corresponde ao tipo informado.";
    case 429:
      return "Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.";
    case 503:
      return "O armazenamento está indisponível no momento. Nada foi salvo; tente novamente em instantes.";
    default:
      return fallback ?? "Não foi possível concluir o envio. Tente novamente.";
  }
}
