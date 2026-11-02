import { hashId, sealBackup } from "../crypto";
import type { Env } from "../env";
import { settings } from "../env";
import { purgeDesign } from "../routes/designs";
import { settle } from "../services/budget";
import { now, toHex } from "../util";
import { processJobs } from "./jobs";

type Task = [string, () => Promise<unknown>];

/** Every 10 minutes. */
export function frequentTasks(env: Env): Task[] {
  return [
    ["expire", () => expire(env)],
    ["enqueue_deletions", () => enqueueDeletions(env)],
    ["jobs", () => processJobs(env)],
    ["stale_reservations", () => releaseStaleReservations(env)],
  ];
}

/** Daily. */
export function dailyTasks(env: Env): Task[] {
  return [
    ["purge_trash", () => purgeTrash(env)],
    ["orphans", () => removeOrphans(env)],
    ["stale_assets", () => staleAssets(env)],
    ["learning", () => aggregateLearning(env)],
    ["housekeeping", () => housekeeping(env)],
  ];
}

/** Weekly. */
export function weeklyTasks(env: Env): Task[] {
  return [["budget", () => correctBudget(env)], ["backup", () => backupMetadata(env)]];
}

/** Delete expired sessions and tokens, and temporary export files. */
export async function expire(env: Env): Promise<void> {
  const t = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?1 OR (revoked_at IS NOT NULL AND revoked_at < ?2)").bind(t - 86400, t - 7 * 86400),
    env.DB.prepare("DELETE FROM auth_tokens WHERE expires_at < ?1").bind(t - 3600),
  ]);
  const cutoff = Date.now() - settings(env).exportTtl * 1000;
  let cursor: string | undefined;
  do {
    const page = await env.BUCKET.list({ prefix: "exports/", cursor, limit: 200 });
    const old = page.objects.filter((o) => o.uploaded.getTime() < cutoff).map((o) => o.key);
    if (old.length) await env.BUCKET.delete(old);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

/** Accounts past their grace period get a delete job (once). */
export async function enqueueDeletions(env: Env): Promise<void> {
  const t = now();
  await env.DB.prepare(
    `INSERT INTO jobs (kind, user_id, status, attempts, run_after, created_at)
     SELECT 'delete_account', u.id, 'queued', 0, ?1, ?1 FROM users u
     WHERE u.status = 'pending_deletion' AND u.deletion_at <= ?1
       AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.user_id = u.id AND j.kind = 'delete_account' AND j.status IN ('queued','running'))`,
  ).bind(t).run();
}

/** A request that died after reserving credits would otherwise hold them forever. */
export async function releaseStaleReservations(env: Env): Promise<void> {
  const rows = await env.DB.prepare("SELECT request_id, reserved FROM model_usage WHERE status = 'reserved' AND created_at < ?1 LIMIT 50").bind(now() - 300).all<{ request_id: string; reserved: number }>();
  for (const r of rows.results) await settle(env.DB, r.request_id, r.reserved, 0, "failed");
}

/** Designs in the trash for more than 30 days. */
export async function purgeTrash(env: Env): Promise<number> {
  const rows = await env.DB.prepare("SELECT id FROM designs WHERE trashed_at IS NOT NULL AND trashed_at < ?1 LIMIT 50").bind(now() - settings(env).trashDays * 86400).all<{ id: string }>();
  for (const r of rows.results) await purgeDesign(env, r.id);
  return rows.results.length;
}

const ORPHAN_SCAN = 300;

/** An R2 object that was written but never referenced (a failed or conflicting save) is removed after 24 hours. */
export async function removeOrphans(env: Env): Promise<number> {
  let removed = 0;
  for (const [prefix, table, col] of [["v/", "design_versions", "r2_key"], ["a/", "assets", "r2_key"]] as const) {
    const stateKey = `cron:orphan:${prefix}`;
    const saved = await env.DB.prepare("SELECT response FROM idempotency WHERE key = ?1").bind(stateKey).first<{ response: string }>();
    const page = await env.BUCKET.list({ prefix, cursor: saved?.response || undefined, limit: ORPHAN_SCAN });
    const old = page.objects.filter((o) => o.uploaded.getTime() < Date.now() - 24 * 3600 * 1000);
    for (let i = 0; i < old.length; i += 90) {
      const chunk = old.slice(i, i + 90).map((o) => o.key);
      const known = await env.DB.prepare(`SELECT ${col} AS k FROM ${table} WHERE ${col} IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all<{ k: string }>();
      const have = new Set(known.results.map((r) => r.k));
      const dead = chunk.filter((k) => !have.has(k));
      if (dead.length) { await env.BUCKET.delete(dead); removed += dead.length; }
    }
    // Remember where the scan stopped; start over when it reaches the end.
    await env.DB.prepare("INSERT OR REPLACE INTO idempotency (key, response, created_at) VALUES (?1, ?2, ?3)").bind(stateKey, page.truncated ? page.cursor : "", now()).run();
  }
  return removed;
}

/** Uploads that never finished. */
export async function staleAssets(env: Env): Promise<void> {
  const rows = await env.DB.prepare("SELECT id, r2_key FROM assets WHERE status != 'ready' AND created_at < ?1 LIMIT 100").bind(now() - 86400).all<{ id: string; r2_key: string }>();
  for (const r of rows.results) {
    await env.BUCKET.delete(r.r2_key);
    await env.DB.prepare("DELETE FROM assets WHERE id = ?1").bind(r.id).run();
  }
}

/** Aggregate recent days, then delete raw events older than 12 months. Recomputing a day gives the same answer, so reruns are safe. */
export async function aggregateLearning(env: Env): Promise<void> {
  const t = now(), dayStart = t - (t % 86400);
  for (let back = 1; back <= 3; back++) {
    const start = dayStart - back * 86400, end = start + 86400;
    const day = new Date(start * 1000).toISOString().slice(0, 10);
    await env.DB.prepare(
      `INSERT OR REPLACE INTO learning_aggregates (day, command_id, mode, style_id, outcome, count)
       SELECT ?1, command_id, mode, COALESCE(style_id, ''), outcome, COUNT(*) FROM learning_events WHERE occurred_at >= ?2 AND occurred_at < ?3
       GROUP BY command_id, mode, COALESCE(style_id, ''), outcome`,
    ).bind(day, start, end).run();
  }
  await env.DB.prepare("DELETE FROM learning_events WHERE occurred_at < ?1").bind(t - 365 * 86400).run();
}

export async function housekeeping(env: Env): Promise<void> {
  const t = now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM rate_counters WHERE window_start < ?1").bind(t - 2 * 86400),
    env.DB.prepare("DELETE FROM idempotency WHERE created_at < ?1 AND key NOT LIKE 'cron:%'").bind(t - 86400),
    env.DB.prepare("DELETE FROM critique_cache WHERE created_at < ?1").bind(t - 86400),
  ]);
}

/** The ledger is the record. Config sets the starting credits and the reserve; spent and reserved are recomputed from usage rows. */
export async function correctBudget(env: Env): Promise<void> {
  const s = settings(env);
  await env.DB.prepare(
    `UPDATE budget SET starting_credits = ?1, reserve_credits = ?2,
       spent_credits = (SELECT COALESCE(SUM(actual), 0) FROM model_usage WHERE status = 'complete'),
       reserved_credits = (SELECT COALESCE(SUM(reserved), 0) FROM model_usage WHERE status = 'reserved'), updated_at = ?3 WHERE id = 1`,
  ).bind(s.startingCredits, s.reserveCredits, now()).run();
}

const BACKUP_TABLES = ["users", "oauth_links", "designs", "design_versions", "assets", "share_grants", "consents", "learning_link", "budget", "model_usage", "jobs"];
const BACKUP_ROW_CAP = 100_000;

/** Weekly export of D1 metadata to R2, encrypted with a key derived from the master key. Sessions and sign-in tokens are left out. */
export async function backupMetadata(env: Env): Promise<string> {
  const lines: string[] = [];
  for (const table of BACKUP_TABLES) {
    for (let offset = 0; lines.length < BACKUP_ROW_CAP; offset += 1000) {
      const rows = await env.DB.prepare(`SELECT * FROM ${table} LIMIT 1000 OFFSET ?1`).bind(offset).all<Record<string, unknown>>();
      for (const r of rows.results) lines.push(JSON.stringify({ t: table, r: encodeRow(r) }));
      if (rows.results.length < 1000) break;
    }
  }
  const key = `backups/${new Date().toISOString().slice(0, 10)}.enc`;
  await env.BUCKET.put(key, await sealBackup(env, key, new TextEncoder().encode(lines.join("\n"))));
  const all = (await env.BUCKET.list({ prefix: "backups/" })).objects.map((o) => o.key).sort();
  if (all.length > 8) await env.BUCKET.delete(all.slice(0, all.length - 8));
  return key;
}

function encodeRow(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) out[k] = v instanceof ArrayBuffer ? { b64: btoa(String.fromCharCode(...new Uint8Array(v))) } : Array.isArray(v) ? { b64: btoa(String.fromCharCode(...(v as number[]))) } : v;
  return out;
}
export { hashId, toHex };
