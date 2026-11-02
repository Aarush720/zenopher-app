import { tooMany } from "./errors";
import { now } from "./util";

/** Fixed-window counter in D1. Throws 429 when the limit is passed. */
export async function rateLimit(db: D1Database, key: string, limit: number, windowSec: number): Promise<number> {
  const t = now();
  const row = await db
    .prepare(
      `INSERT INTO rate_counters (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
       RETURNING count, window_start`,
    )
    .bind(key, t, t - windowSec)
    .first<{ count: number; window_start: number }>();
  if (row && row.count > limit) throw tooMany(Math.max(1, row.window_start + windowSec - t));
  return row?.count ?? 1;
}

/** Read the counter without counting. */
export async function rateCount(db: D1Database, key: string, windowSec: number): Promise<number> {
  const row = await db.prepare("SELECT count FROM rate_counters WHERE key = ?1 AND window_start > ?2").bind(key, now() - windowSec).first<{ count: number }>();
  return row?.count ?? 0;
}

export interface StoredResponse { status: number; body: unknown }

export async function idempotent(db: D1Database, userId: string, clientKey: string | undefined, run: () => Promise<StoredResponse>): Promise<StoredResponse> {
  if (!clientKey) return run();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(clientKey)) return { status: 400, body: { error: { code: "bad_idempotency_key", message: "Idempotency-Key must be 8 to 80 URL-safe characters." } } };
  const key = `${userId}:${clientKey}`;
  const hit = await db.prepare("SELECT response FROM idempotency WHERE key = ?1").bind(key).first<{ response: string }>();
  if (hit) return JSON.parse(hit.response) as StoredResponse;
  const res = await run();
  if (res.status < 500) await db.prepare("INSERT OR IGNORE INTO idempotency (key, response, created_at) VALUES (?1, ?2, ?3)").bind(key, JSON.stringify(res), now()).run();
  return res;
}
