// The credit ledger (spec 9.2, 9.3). Reservation is one conditional UPDATE: it either reserves or changes nothing,
// and SQLite serialises writes, so two requests cannot both take the last credits.
import { now } from "../util";

export async function reserve(db: D1Database, requestId: string, userHash: string, amount: number): Promise<boolean> {
  const t = now();
  const r = await db
    .prepare(
      `UPDATE budget SET reserved_credits = reserved_credits + ?1, updated_at = ?2
       WHERE id = 1 AND starting_credits - spent_credits - reserved_credits - reserve_credits >= ?1`,
    )
    .bind(amount, t)
    .run();
  if (r.meta.changes !== 1) return false;
  await db.prepare("INSERT INTO model_usage (request_id, user_id_hash, reserved, actual, status, created_at) VALUES (?1, ?2, ?3, NULL, 'reserved', ?4)").bind(requestId, userHash, amount, t).run();
  return true;
}

/** Settle after the Muse call. On failure or timeout, pass actual = 0 to release the reservation. */
export async function settle(db: D1Database, requestId: string, reserved: number, actual: number, status: "complete" | "released" | "failed"): Promise<void> {
  const t = now();
  await db.batch([
    db.prepare("UPDATE budget SET reserved_credits = reserved_credits - ?1, spent_credits = spent_credits + ?2, updated_at = ?3 WHERE id = 1").bind(reserved, actual, t),
    db.prepare("UPDATE model_usage SET actual = ?2, status = ?3 WHERE request_id = ?1 AND status = 'reserved'").bind(requestId, actual, status),
  ]);
}

export async function remaining(db: D1Database): Promise<number> {
  const b = await db.prepare("SELECT starting_credits s, spent_credits p, reserved_credits r, reserve_credits v FROM budget WHERE id = 1").first<{ s: number; p: number; r: number; v: number }>();
  return b ? b.s - b.p - b.r - b.v : 0;
}
