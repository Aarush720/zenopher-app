// Envelope encryption (spec 7.1):
//   master key (ZPH_MASTER_KEY) wraps a per-design DEK        AES-256-GCM, random 96-bit nonce, AAD = design id
//   the DEK encrypts each version blob                        AES-256-GCM, random 96-bit nonce, AAD = design id + version
// Stored form is nonce || ciphertext||tag. Other keys (access tokens, id hashing, backups) are derived from the master
// key with HKDF and a distinct label, so no extra secret is needed.
import type { Env } from "./env";
import { b64url, concat, fromB64, fromB64url, randomBytes, timingSafeEqual, toHex } from "./util";

const enc = new TextEncoder();
const NONCE = 12;

function masterBytes(env: Env): Uint8Array {
  const raw = env.ZPH_MASTER_KEY ? fromB64(env.ZPH_MASTER_KEY) : new Uint8Array(0);
  if (raw.length !== 32) throw new Error("ZPH_MASTER_KEY must be 32 bytes, base64 encoded");
  return raw;
}

const aesKey = (raw: Uint8Array, usages: ('encrypt' | 'decrypt')[]) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, usages);

async function seal(key: CryptoKey, aad: string, plain: Uint8Array): Promise<Uint8Array> {
  const nonce = randomBytes(NONCE);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: enc.encode(aad) }, key, plain));
  return concat(nonce, ct);
}
async function open(key: CryptoKey, aad: string, sealed: Uint8Array): Promise<Uint8Array> {
  if (sealed.length < NONCE + 16) throw new Error("ciphertext too short");
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.slice(0, NONCE), additionalData: enc.encode(aad) }, key, sealed.slice(NONCE)));
}

export async function newDek(env: Env, designId: string): Promise<{ dek: Uint8Array; wrapped: Uint8Array }> {
  const dek = randomBytes(32);
  const wrapped = await seal(await aesKey(masterBytes(env), ["encrypt"]), designId, dek);
  return { dek, wrapped };
}
export async function unwrapDek(env: Env, designId: string, wrapped: Uint8Array): Promise<Uint8Array> {
  return open(await aesKey(masterBytes(env), ["decrypt"]), designId, wrapped);
}
export async function encryptBlob(dek: Uint8Array, designId: string, version: number, plain: Uint8Array): Promise<Uint8Array> {
  return seal(await aesKey(dek, ["encrypt"]), `${designId}:${version}`, plain);
}
export async function decryptBlob(dek: Uint8Array, designId: string, version: number, sealed: Uint8Array): Promise<Uint8Array> {
  return open(await aesKey(dek, ["decrypt"]), `${designId}:${version}`, sealed);
}
/** Plaintext size from the stored size: nonce (12) and GCM tag (16) are the overhead. */
export const plainSize = (storedBytes: number) => Math.max(0, storedBytes - NONCE - 16);

async function derive(env: Env, label: string): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", masterBytes(env), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode(label) }, base, 256);
  return new Uint8Array(bits);
}
const hmacKey = async (env: Env, label: string) => crypto.subtle.importKey("raw", await derive(env, label), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

/** Keyed hash for rate-limit keys and usage logs, so emails and IPs cannot be brute-forced from the tables. */
export async function hashId(env: Env, value: string): Promise<string> {
  return toHex(await crypto.subtle.sign("HMAC", await hmacKey(env, "zph-hash-v1"), enc.encode(value))).slice(0, 32);
}

export interface AccessClaims { uid: string; fam: string; iat: number; exp: number }

/** Short-lived signed access token: v1.<payload>.<mac>. The session row is still checked on every request. */
export async function signAccess(env: Env, c: AccessClaims): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(c)));
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(env, "zph-access-v1"), enc.encode(`v1.${payload}`));
  return `v1.${payload}.${b64url(mac)}`;
}
export async function verifyAccess(env: Env, token: string, nowSec: number): Promise<AccessClaims | null> {
  const [v, payload, mac] = token.split(".");
  if (v !== "v1" || !payload || !mac) return null;
  const expected = b64url(await crypto.subtle.sign("HMAC", await hmacKey(env, "zph-access-v1"), enc.encode(`v1.${payload}`)));
  if (!timingSafeEqual(expected, mac)) return null;
  try {
    const c = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as AccessClaims;
    return c.exp > nowSec && typeof c.uid === "string" && typeof c.fam === "string" ? c : null;
  } catch { return null; }
}

/** Encrypts a backup with a key derived from the master key. */
export async function sealBackup(env: Env, label: string, plain: Uint8Array): Promise<Uint8Array> {
  return seal(await aesKey(await derive(env, "zph-backup-v1"), ["encrypt"]), label, plain);
}
export async function openBackup(env: Env, label: string, sealed: Uint8Array): Promise<Uint8Array> {
  return open(await aesKey(await derive(env, "zph-backup-v1"), ["decrypt"]), label, sealed);
}
