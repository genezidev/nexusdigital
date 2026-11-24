// Tipo REAL do arquivo pelos primeiros bytes (assinatura / "magic numbers"), nunca pelo nome nem pelo
// Content-Type declarado (R-5, spec 0002 "Arquivo malicioso"). Funcoes puras, sem I/O.
// So os tipos da lista permitida sao reconhecidos; o resto (executavel, SVG, HTML, XML, Office, ZIP, Matroska...)
// devolve null e e recusado. Quantidade de bytes necessaria: HEAD_BYTES.

export const HEAD_BYTES = 4096;

export type DetectedMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | "video/mp4" | "video/quicktime" | "video/webm";

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0) => b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, at: number, len: number) => (b.length >= at + len ? String.fromCharCode(...b.subarray(at, at + len)) : "");

// Marcas principais (major brand) da caixa `ftyp` que sao MP4 de video. HEIC/HEIF/AVIF (mif1, heic, avif...)
// tambem usam `ftyp` e NAO entram: nao sao videos nem estao na lista permitida.
const MP4_BRANDS = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "dash", "M4V ", "MSNV", "XAVC"]);

export function detectFileType(head: Uint8Array): DetectedMime | null {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP") return "image/webp";
  if (ascii(head, 0, 5) === "%PDF-") return "application/pdf";
  if (ascii(head, 4, 4) === "ftyp") {
    const brand = ascii(head, 8, 4);
    if (brand === "qt  ") return "video/quicktime";
    if (MP4_BRANDS.has(brand)) return "video/mp4";
    return null;
  }
  // WebM = Matroska com DocType "webm" (EBML 1A 45 DF A3, elemento DocType 42 82 e o texto). Matroska comum (.mkv) nao entra.
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) {
    const window = head.subarray(0, Math.min(head.length, 64));
    for (let i = 4; i + 6 < window.length; i++) {
      if (window[i] === 0x42 && window[i + 1] === 0x82 && ascii(window, i + 3, 4) === "webm") return "video/webm";
    }
    return null;
  }
  return null;
}

// Extensao final coerente com o tipo real. Dupla extensao perigosa e tratada em asset-policy (hasBlockedExtension).
const EXTENSIONS: Record<DetectedMime, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"],
  "video/mp4": ["mp4", "m4v"],
  "video/quicktime": ["mov"],
  "video/webm": ["webm"],
};

export function finalExtension(originalName: string): string | null {
  const i = originalName.lastIndexOf(".");
  if (i <= 0 || i === originalName.length - 1) return null;
  return originalName.slice(i + 1).trim().toLowerCase();
}

export function extensionMatches(originalName: string, mime: DetectedMime): boolean {
  const ext = finalExtension(originalName);
  return ext !== null && EXTENSIONS[mime].includes(ext);
}

export type UploadRefusal = "TYPE_UNRECOGNIZED" | "TYPE_MISMATCH" | "EXTENSION_MISMATCH";

/**
 * Confere o que o servidor MEDIU (primeiros bytes) contra o que a pessoa declarou (tipo e nome).
 * O tipo detectado e o unico que vale; qualquer divergencia recusa o arquivo.
 */
export function verifyUploadedType(input: { head: Uint8Array; declaredMime: string; originalName: string }):
  | { ok: true; mime: DetectedMime }
  | { ok: false; code: UploadRefusal } {
  const real = detectFileType(input.head);
  if (!real) return { ok: false, code: "TYPE_UNRECOGNIZED" };
  if (input.declaredMime.trim().toLowerCase() !== real) return { ok: false, code: "TYPE_MISMATCH" };
  if (!extensionMatches(input.originalName, real)) return { ok: false, code: "EXTENSION_MISMATCH" };
  return { ok: true, mime: real };
}
