// Minimal ustar writer for account exports. Chosen over zip because tar needs no per-file CRC, which matters on the
// free plan's CPU limit. Names must be ASCII and at most 100 bytes.
const enc = new TextEncoder();

function field(buf: Uint8Array, offset: number, len: number, text: string) { buf.set(enc.encode(text).subarray(0, len), offset); }
const octal = (n: number, width: number) => n.toString(8).padStart(width - 1, "0") + "\0";

export function tar(files: { name: string; data: Uint8Array; mtime?: number }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const f of files) {
    if (enc.encode(f.name).length > 100) throw new Error("tar name too long");
    const h = new Uint8Array(512);
    field(h, 0, 100, f.name);
    field(h, 100, 8, "0000644\0");
    field(h, 108, 8, "0000000\0");
    field(h, 116, 8, "0000000\0");
    field(h, 124, 12, octal(f.data.length, 12));
    field(h, 136, 12, octal(f.mtime ?? 0, 12));
    field(h, 148, 8, "        ");
    h[156] = 0x30;
    field(h, 257, 6, "ustar\0");
    field(h, 263, 2, "00");
    const sum = h.reduce((a, b) => a + b, 0);
    field(h, 148, 8, sum.toString(8).padStart(6, "0") + "\0 ");
    parts.push(h, f.data, new Uint8Array((512 - (f.data.length % 512)) % 512));
  }
  parts.push(new Uint8Array(1024));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
