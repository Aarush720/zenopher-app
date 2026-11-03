import type { Env } from "./env";
import { settings } from "./env";
import { storageFull } from "./errors";
import { now } from "./util";

const DEFAULT_HARD_LIMIT = 8 * 1024 * 1024 * 1024;

export interface StorageStatus {
  available: boolean;
  trackedBytes: number;
  reservedBytes: number;
  limitBytes: number;
  usedBytes: number;
}

function storageSettings(env: Env) {
  const s = settings(env);
  return {
    limitBytes: s.r2HardLimitBytes > 0 ? s.r2HardLimitBytes : DEFAULT_HARD_LIMIT,
    reservedBytes: Math.max(0, s.r2ReservedBytes),
  };
}

export async function getStorageStatus(env: Env): Promise<StorageStatus> {
  const row = await env.DB.prepare("SELECT tracked_bytes FROM storage_usage WHERE id = 1").first<{ tracked_bytes: number }>();
  const { limitBytes, reservedBytes } = storageSettings(env);
  const trackedBytes = Math.max(0, Number(row?.tracked_bytes ?? 0));
  const usedBytes = reservedBytes + trackedBytes;
  return { available: usedBytes < limitBytes, trackedBytes, reservedBytes, limitBytes, usedBytes };
}

/** Atomically reserves room before an R2 write. It fails closed when the cap is reached. */
export async function reserveStorage(env: Env, bytes: number): Promise<void> {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  const { limitBytes, reservedBytes } = storageSettings(env);
  const allowedTracked = limitBytes - reservedBytes;
  const result = await env.DB.prepare(
    `UPDATE storage_usage
     SET tracked_bytes = tracked_bytes + ?1, updated_at = ?2
     WHERE id = 1 AND tracked_bytes + ?1 <= ?3`,
  ).bind(Math.ceil(bytes), now(), allowedTracked).run();
  if (result.meta.changes !== 1) throw storageFull();
}

export async function releaseStorage(env: Env, bytes: number): Promise<void> {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  await env.DB.prepare(
    "UPDATE storage_usage SET tracked_bytes = MAX(0, tracked_bytes - ?1), updated_at = ?2 WHERE id = 1",
  ).bind(Math.ceil(bytes), now()).run();
}

/** Writes an object while accounting for an overwrite as a size delta. */
export async function putStoredObject(
  env: Env,
  key: string,
  value: Uint8Array,
  options?: R2PutOptions,
): Promise<void> {
  const old = await env.BUCKET.head(key);
  const oldBytes = old?.size ?? 0;
  const delta = value.byteLength - oldBytes;
  if (delta > 0) await reserveStorage(env, delta);
  try {
    await env.BUCKET.put(key, value, options);
  } catch (error) {
    if (delta > 0) await releaseStorage(env, delta);
    throw error;
  }
  if (delta < 0) await releaseStorage(env, -delta);
}

export async function deleteStoredObject(env: Env, key: string, knownBytes?: number): Promise<void> {
  const bytes = knownBytes ?? (await env.BUCKET.head(key))?.size ?? 0;
  await env.BUCKET.delete(key);
  if (bytes > 0) await releaseStorage(env, bytes);
}
