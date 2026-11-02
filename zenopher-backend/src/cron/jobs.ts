import { decryptBlob, hashId, plainSize, unwrapDek } from "../crypto";
import type { Env } from "../env";
import { settings } from "../env";
import { purgeDesign } from "../routes/designs";
import { tar } from "../services/tar";
import { now, toU8 } from "../util";

interface Job { id: number; kind: string; user_id: string; attempts: number }
class Permanent extends Error {}
const MAX_ATTEMPTS = 5;
const BATCH = 5;

/** Runs queued jobs in small batches. A failed job backs off and retries; after five attempts it is marked failed. */
export async function processJobs(env: Env): Promise<number> {
  const t = now();
  await env.DB.prepare("UPDATE jobs SET status = 'queued' WHERE status = 'running' AND run_after < ?1").bind(t - 1800).run(); // crashed run
  const due = await env.DB.prepare("SELECT id, kind, user_id, attempts FROM jobs WHERE status = 'queued' AND run_after <= ?1 ORDER BY id LIMIT ?2").bind(t, BATCH).all<Job>();
  let done = 0;
  for (const job of due.results) {
    const claimed = await env.DB.prepare("UPDATE jobs SET status = 'running', attempts = attempts + 1, run_after = ?2 WHERE id = ?1 AND status = 'queued'").bind(job.id, t).run();
    if (claimed.meta.changes !== 1) continue;
    try {
      if (job.kind === "export") await exportAccount(env, job);
      else if (job.kind === "delete_learning") await deleteLearning(env, job.user_id);
      else if (job.kind === "delete_account") await deleteAccount(env, job.user_id);
      else throw new Permanent("unknown job");
      await env.DB.prepare("UPDATE jobs SET status = 'done' WHERE id = ?1").bind(job.id).run();
      done++;
    } catch (e) {
      const attempts = job.attempts + 1;
      const final = e instanceof Permanent || attempts >= MAX_ATTEMPTS;
      await env.DB.prepare("UPDATE jobs SET status = ?2, run_after = ?3 WHERE id = ?1").bind(job.id, final ? "failed" : "queued", now() + 60 * 2 ** attempts).run();
      console.error(JSON.stringify({ level: "error", event: "job_failed", kind: job.kind, job_id: job.id, attempts }));
    }
  }
  return done;
}

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/gzip": "zph", "font/woff2": "woff2", "font/woff": "woff", "font/ttf": "ttf", "font/otf": "otf" };
const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v, null, 2));

/** Account export: profile, each design's latest version (decrypted), original assets, consent history, learning events. */
export async function exportAccount(env: Env, job: Job): Promise<void> {
  const db = env.DB, uid = job.user_id;
  const user = await db.prepare("SELECT id, email, email_verified, display_name, status, created_at FROM users WHERE id = ?1").bind(uid).first();
  if (!user) throw new Permanent("no user");
  const designs = (await db.prepare("SELECT d.*, v.r2_key AS vkey, v.byte_size AS vsize FROM designs d LEFT JOIN design_versions v ON v.design_id = d.id AND v.version = d.current_version WHERE d.owner_id = ?1").bind(uid).all<Record<string, unknown>>()).results;
  const assets = (await db.prepare("SELECT id, r2_key, mime, byte_size, created_at FROM assets WHERE owner_id = ?1 AND status = 'ready'").bind(uid).all<{ id: string; r2_key: string; mime: string; byte_size: number }>()).results;
  const total = designs.reduce((n, d) => n + plainSize(Number(d.vsize ?? 0)), 0) + assets.reduce((n, a) => n + a.byte_size, 0);
  if (total > settings(env).exportMaxBytes) throw new Permanent("export too large");

  const files: { name: string; data: Uint8Array; mtime?: number }[] = [];
  files.push({ name: "profile.json", data: json(user) });
  files.push({ name: "consents.json", data: json((await db.prepare("SELECT purpose, decision, policy_version, created_at FROM consents WHERE user_id = ?1 ORDER BY id").bind(uid).all()).results) });
  const link = await db.prepare("SELECT pseudo_id FROM learning_link WHERE user_id = ?1").bind(uid).first<{ pseudo_id: string }>();
  if (link) files.push({ name: "learning_events.json", data: json((await db.prepare("SELECT command_id AS rule, mode, style_id, outcome, occurred_at FROM learning_events WHERE pseudo_id = ?1").bind(link.pseudo_id).all()).results) });
  for (const d of designs) {
    const id = String(d.id);
    files.push({ name: `designs/${id}/meta.json`, data: json({ id, title: d.title, mode: d.mode, style_id: d.style_id, width_px: d.width_px, height_px: d.height_px, current_version: d.current_version, trashed_at: d.trashed_at, created_at: d.created_at, updated_at: d.updated_at }) });
    if (d.vkey) {
      const obj = await env.BUCKET.get(String(d.vkey));
      if (obj) {
        const dek = await unwrapDek(env, id, toU8(d.wrapped_dek));
        files.push({ name: `designs/${id}/v${d.current_version}.zph`, data: await decryptBlob(dek, id, Number(d.current_version), new Uint8Array(await obj.arrayBuffer())) });
      }
    }
  }
  for (const a of assets) {
    const obj = await env.BUCKET.get(a.r2_key);
    if (obj) files.push({ name: `assets/${a.id}.${EXT[a.mime] ?? "bin"}`, data: new Uint8Array(await obj.arrayBuffer()) });
  }
  await env.BUCKET.put(`exports/${uid}/${job.id}.tar`, tar(files));
}

export async function deleteLearning(env: Env, userId: string): Promise<void> {
  const link = await env.DB.prepare("SELECT pseudo_id FROM learning_link WHERE user_id = ?1").bind(userId).first<{ pseudo_id: string }>();
  if (!link) return;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM learning_events WHERE pseudo_id = ?1").bind(link.pseudo_id),
    env.DB.prepare("DELETE FROM learning_link WHERE user_id = ?1").bind(userId),
  ]);
}

/** Removes everything that belongs to the user, objects first, rows after, so a retry after a crash can finish the job. */
export async function deleteAccount(env: Env, userId: string): Promise<void> {
  const db = env.DB;
  const u = await db.prepare("SELECT status, deletion_at, email FROM users WHERE id = ?1").bind(userId).first<{ status: string; deletion_at: number | null; email: string }>();
  if (!u) return;
  if (u.status !== "pending_deletion" || (u.deletion_at ?? Infinity) > now()) return; // cancelled in the meantime
  for (;;) {
    const batch = await db.prepare("SELECT id FROM designs WHERE owner_id = ?1 LIMIT 25").bind(userId).all<{ id: string }>();
    if (!batch.results.length) break;
    for (const d of batch.results) await purgeDesign(env, d.id);
  }
  const assets = (await db.prepare("SELECT r2_key FROM assets WHERE owner_id = ?1").bind(userId).all<{ r2_key: string }>()).results.map((a) => a.r2_key);
  for (let i = 0; i < assets.length; i += 500) await env.BUCKET.delete(assets.slice(i, i + 500));
  let cursor: string | undefined;
  do {
    const page = await env.BUCKET.list({ prefix: `exports/${userId}/`, cursor });
    if (page.objects.length) await env.BUCKET.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  await deleteLearning(env, userId);
  const uh = await hashId(env, userId);
  await db.batch([
    db.prepare("DELETE FROM share_grants WHERE grantee_user_id = ?1").bind(userId),
    db.prepare("DELETE FROM assets WHERE owner_id = ?1").bind(userId),
    db.prepare("DELETE FROM oauth_links WHERE user_id = ?1").bind(userId),
    db.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(userId),
    db.prepare("DELETE FROM auth_tokens WHERE user_id = ?1 OR email = ?2").bind(userId, u.email),
    db.prepare("DELETE FROM consents WHERE user_id = ?1").bind(userId),
    db.prepare("DELETE FROM idempotency WHERE key LIKE ?1").bind(`${userId}:%`),
    db.prepare("DELETE FROM rate_counters WHERE key LIKE ?1").bind(`%:${userId}`),
    db.prepare("DELETE FROM model_usage WHERE user_id_hash = ?1").bind(uh),
    db.prepare("DELETE FROM jobs WHERE user_id = ?1").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ?1").bind(userId),
  ]);
}
