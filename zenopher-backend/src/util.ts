const enc = new TextEncoder();

export const now = () => Math.floor(Date.now() / 1000);

export function toHex(b: ArrayBuffer | Uint8Array): string {
  return [...(b instanceof Uint8Array ? b : new Uint8Array(b))].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function b64url(b: ArrayBuffer | Uint8Array): string {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromB64url(s: string): Uint8Array {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export function randomBytes(n: number): Uint8Array { return crypto.getRandomValues(new Uint8Array(n)); }

const B32 = "abcdefghijklmnopqrstuvwxyz234567";
/** Random 128-bit id, base32, lowercase. Unguessable and uncountable. */
export function randomId(): string {
  const bytes = randomBytes(16);
  let bits = 0, value = 0, out = "";
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Random 256-bit opaque token. */
export const randomToken = () => b64url(randomBytes(32));

export async function sha256(data: string | Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const bytes = typeof data === "string" ? enc.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}
export async function sha256Hex(data: string | Uint8Array | ArrayBuffer): Promise<string> { return toHex(await sha256(data)); }

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const ID_RE = /^[a-z2-7]{26}$/;

/** D1 returns BLOBs as ArrayBuffer (or, on older runtimes, number arrays). */
export function toU8(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (Array.isArray(v)) return Uint8Array.from(v as number[]);
  throw new Error("not a blob");
}
