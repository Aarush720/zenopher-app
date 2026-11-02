// Sessions (spec 8.2). Access token: short-lived, signed. Refresh token: opaque 256-bit secret, only its hash is stored,
// rotated on each use, and reuse of an old one revokes the whole family.
import { signAccess } from "./crypto";
import type { Env } from "./env";
import { settings } from "./env";
import { now, randomId, randomToken, sha256Hex, timingSafeEqual } from "./util";
import { ApiError, unauthorized } from "./errors";

const REFRESH_COOKIE = "zph_rt";
/** A replay this soon after rotation is two tabs racing, not theft. It is refused but does not end the family. */
const RACE_GRACE_SEC = 10;

export interface Issued { accessToken: string; expiresIn: number; cookie: string }

export const cookieHeader = (value: string, maxAge: number) =>
  `${REFRESH_COOKIE}=${value}; Path=/v1/auth; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
export const clearCookie = () => cookieHeader("", 0);

export function readRefreshCookie(header: string | null): { id: string; secret: string } | null {
  const m = (header ?? "").split(";").map((s) => s.trim()).find((s) => s.startsWith(`${REFRESH_COOKIE}=`));
  const v = m?.slice(REFRESH_COOKIE.length + 1) ?? "";
  const [id, secret] = v.split(".");
  return id && secret ? { id, secret } : null;
}

async function access(env: Env, uid: string, fam: string): Promise<{ token: string; expiresIn: number }> {
  const s = settings(env), t = now();
  return { token: await signAccess(env, { uid, fam, iat: t, exp: t + s.accessTtl }), expiresIn: s.accessTtl };
}

async function insertSession(env: Env, userId: string, family: string, device: string | null): Promise<string> {
  const s = settings(env), t = now(), id = randomId(), secret = randomToken();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, family_id, refresh_hash, device, created_at, last_used_at, expires_at, revoked_at) VALUES (?1,?2,?3,?4,?5,?6,?6,?7,NULL)")
    .bind(id, userId, family, await sha256Hex(secret), device, t, t + s.refreshTtl).run();
  return `${id}.${secret}`;
}

export async function startSession(env: Env, userId: string, device: string | null): Promise<Issued> {
  const family = randomId();
  const refresh = await insertSession(env, userId, family, device?.slice(0, 120) ?? null);
  const a = await access(env, userId, family);
  return { accessToken: a.token, expiresIn: a.expiresIn, cookie: cookieHeader(refresh, settings(env).refreshTtl) };
}

export async function rotateSession(env: Env, cookie: { id: string; secret: string }): Promise<Issued> {
  const row = await env.DB.prepare("SELECT id, user_id, family_id, refresh_hash, device, expires_at, revoked_at FROM sessions WHERE id = ?1").bind(cookie.id)
    .first<{ id: string; user_id: string; family_id: string; refresh_hash: string; device: string | null; expires_at: number; revoked_at: number | null }>();
  if (!row || !timingSafeEqual(row.refresh_hash, await sha256Hex(cookie.secret))) throw unauthorized();
  const t = now();
  if (row.revoked_at !== null) {
    if (t - row.revoked_at <= RACE_GRACE_SEC) throw new ApiError(401, "refresh_race", "Please try again.");
    await revokeFamily(env, row.family_id); // a used or revoked token came back: assume it was copied
    throw new ApiError(401, "session_revoked", "Please sign in again.");
  }
  if (row.expires_at <= t) throw unauthorized();
  // Claim the old row first. If another request got there, this one lost the race.
  const claimed = await env.DB.prepare("UPDATE sessions SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL").bind(row.id, t).run();
  if (claimed.meta.changes !== 1) throw new ApiError(401, "refresh_race", "Please try again.");
  const refresh = await insertSession(env, row.user_id, row.family_id, row.device);
  const a = await access(env, row.user_id, row.family_id);
  return { accessToken: a.token, expiresIn: a.expiresIn, cookie: cookieHeader(refresh, settings(env).refreshTtl) };
}

export async function revokeFamily(env: Env, family: string): Promise<void> {
  await env.DB.prepare("UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?2) WHERE family_id = ?1").bind(family, now()).run();
}

/** Revoking every session of a user is one update. */
export async function revokeAll(env: Env, userId: string): Promise<void> {
  await env.DB.prepare("UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?2) WHERE user_id = ?1").bind(userId, now()).run();
}

export async function familyOfCookie(env: Env, cookie: { id: string; secret: string }): Promise<string | null> {
  const row = await env.DB.prepare("SELECT family_id, refresh_hash FROM sessions WHERE id = ?1").bind(cookie.id).first<{ family_id: string; refresh_hash: string }>();
  return row && timingSafeEqual(row.refresh_hash, await sha256Hex(cookie.secret)) ? row.family_id : null;
}
