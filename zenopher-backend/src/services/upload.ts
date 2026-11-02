// Upload checks (spec 8.4). The server cannot re-encode on the free plan, so it relies on strict types, sizes and
// serving headers. Magic bytes only: cheap on CPU.
const FONT_TYPES = ["font/woff2", "font/woff", "font/ttf", "font/otf"] as const;
export const ASSET_TYPES = ["image/png", "image/jpeg", "image/webp", "application/gzip", ...FONT_TYPES] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** What the first bytes say the file is. SVG, HTML and everything else come back null. */
export function sniff(b: Uint8Array): AssetType | null {
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts(b, ascii("RIFF")) && starts(b, ascii("WEBP"), 8)) return "image/webp";
  if (starts(b, [0x1f, 0x8b, 0x08])) return "application/gzip";
  if (starts(b, ascii("wOF2"))) return "font/woff2";
  if (starts(b, ascii("wOFF"))) return "font/woff";
  if (starts(b, [0x00, 0x01, 0x00, 0x00]) || starts(b, ascii("true"))) return "font/ttf";
  if (starts(b, ascii("OTTO"))) return "font/otf";
  return null;
}

export const isImage = (mime: string) => mime.startsWith("image/");

export function declaredType(req: Request): string {
  return (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
}

/** PNG dimensions from the IHDR chunk, or null if the header is not a PNG header. */
export function pngSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 24 || !starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || !starts(b, ascii("IHDR"), 12)) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

/** Headers for anything that serves user files. */
export function userFileHeaders(mime: string, name = "file"): Record<string, string> {
  return {
    "content-type": mime,
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'",
    ...(isImage(mime) ? {} : { "content-disposition": `attachment; filename="${name}"` }),
  };
}
