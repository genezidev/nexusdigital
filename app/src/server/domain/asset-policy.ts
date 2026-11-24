import type { AssetCategory } from "@/generated/prisma/enums";

// Politica de tipos e tamanhos (spec 0002, Suposicoes; valores provisorios e configuraveis). Pura.
// A conferencia do tipo REAL pelos primeiros bytes pertence ao backend de arquivos (R-5); aqui fica a lista.
const MB = 1024 * 1024;

export interface AssetRule {
  category: AssetCategory;
  maxBytes: number;
}

export const ALLOWED_ASSET_TYPES: Readonly<Record<string, AssetRule>> = {
  "image/jpeg": { category: "IMAGEM", maxBytes: 20 * MB },
  "image/png": { category: "IMAGEM", maxBytes: 20 * MB },
  "image/webp": { category: "IMAGEM", maxBytes: 20 * MB },
  "application/pdf": { category: "DOCUMENTO", maxBytes: 50 * MB },
  "video/mp4": { category: "VIDEO", maxBytes: 2 * 1024 * MB },
  "video/quicktime": { category: "VIDEO", maxBytes: 2 * 1024 * MB },
  "video/webm": { category: "VIDEO", maxBytes: 2 * 1024 * MB },
};

const BLOCKED_EXTENSIONS = new Set([
  "exe", "msi", "dll", "bat", "cmd", "sh", "ps1", "jar", "apk", "com", "scr", "html", "htm", "svg", "xml", "js", "mjs",
  "docm", "xlsm", "pptm", "vbs", "php",
]);

/** Qualquer parte depois do primeiro ponto conta (foto.jpg.exe); maiusculas tratadas. */
export function hasBlockedExtension(originalName: string): boolean {
  return originalName
    .toLowerCase()
    .split(".")
    .slice(1)
    .some((part) => BLOCKED_EXTENSIONS.has(part.trim()));
}

export type AssetRefusal = "TYPE_NOT_ALLOWED" | "TOO_LARGE" | "EMPTY" | "BLOCKED_EXTENSION";

/** Limite de tamanho por categoria, em bytes (configuravel por MAX_IMAGE_MB, MAX_PDF_MB e MAX_VIDEO_MB). */
export type AssetLimits = Readonly<Record<AssetCategory, number>>;

export const DEFAULT_ASSET_LIMITS: AssetLimits = { IMAGEM: 20 * MB, DOCUMENTO: 50 * MB, VIDEO: 2 * 1024 * MB };

/** Tamanho maximo para um tipo permitido (null se o tipo nao e permitido). */
export function maxBytesFor(mimeType: string, limits: AssetLimits = DEFAULT_ASSET_LIMITS): number | null {
  const rule = ALLOWED_ASSET_TYPES[mimeType.toLowerCase()];
  return rule ? limits[rule.category] : null;
}

export function checkAssetDeclaration(
  input: { originalName: string; mimeType: string; bytes: number },
  limits: AssetLimits = DEFAULT_ASSET_LIMITS,
):
  | { ok: true; category: AssetCategory }
  | { ok: false; code: AssetRefusal } {
  if (hasBlockedExtension(input.originalName)) return { ok: false, code: "BLOCKED_EXTENSION" };
  const rule = ALLOWED_ASSET_TYPES[input.mimeType.toLowerCase()];
  if (!rule) return { ok: false, code: "TYPE_NOT_ALLOWED" };
  if (!Number.isInteger(input.bytes) || input.bytes <= 0) return { ok: false, code: "EMPTY" };
  if (input.bytes > limits[rule.category]) return { ok: false, code: "TOO_LARGE" };
  return { ok: true, category: rule.category };
}
