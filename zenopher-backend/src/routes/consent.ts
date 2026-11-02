import type { Hono } from "hono";
import { z } from "zod";
import { authenticate, jsonBody, mustBeActive, route, type AppEnv } from "../app";
import { rateLimit } from "../db";
import { hashId } from "../crypto";
import { now } from "../util";

export async function hasConsent(db: D1Database, userId: string, purpose: "critique" | "learning"): Promise<boolean> {
  const r = await db.prepare("SELECT decision FROM consents WHERE user_id = ?1 AND purpose = ?2 ORDER BY id DESC LIMIT 1").bind(userId, purpose).first<{ decision: string }>();
  return r?.decision === "granted";
}

export function consentRoutes(app: Hono<AppEnv>) {
  app.get("/v1/consent", async (c) => {
    route(c, "GET /v1/consent");
    const u = await authenticate(c);
    const rows = await c.env.DB.prepare("SELECT purpose, decision, policy_version, created_at FROM consents WHERE id IN (SELECT MAX(id) FROM consents WHERE user_id = ?1 GROUP BY purpose)").bind(u.id).all();
    return c.json({ consents: rows.results });
  });

  // Append-only: a decision is never edited, a new row is added.
  app.post("/v1/consent", async (c) => {
    route(c, "POST /v1/consent");
    const u = await authenticate(c); mustBeActive(u);
    const b = await jsonBody(c, z.object({ purpose: z.enum(["critique", "learning"]), decision: z.enum(["granted", "withdrawn"]), policy_version: z.string().regex(/^[A-Za-z0-9._-]{1,20}$/) }).strict());
    await rateLimit(c.env.DB, `consent:${u.id}`, 30, 3600);
    const t = now();
    await c.env.DB.prepare("INSERT INTO consents (user_id, purpose, decision, policy_version, created_at) VALUES (?1,?2,?3,?4,?5)").bind(u.id, b.purpose, b.decision, b.policy_version, t).run();
    // Withdrawing learning consent deletes what was collected, through a job so the pseudonymous link is still there to find it.
    if (b.purpose === "learning" && b.decision === "withdrawn") {
      await c.env.DB.prepare("INSERT INTO jobs (kind, user_id, status, attempts, run_after, created_at) VALUES ('delete_learning', ?1, 'queued', 0, ?2, ?2)").bind(u.id, t).run();
    }
    return c.json({ ok: true }, 201);
  });

  // Learning events: outcomes only, under a pseudonymous id kept in a separate table.
  app.post("/v1/learning/events", async (c) => {
    route(c, "POST /v1/learning/events");
    const u = await authenticate(c);
    if (!(await hasConsent(c.env.DB, u.id, "learning"))) return c.json({ error: { code: "consent_required", message: "Learning consent has not been given." } }, 403);
    await rateLimit(c.env.DB, `learning:${await hashId(c.env, u.id)}`, 30, 60);
    const t = now();
    const { events } = await jsonBody(c, z.object({ events: z.array(z.object({
      rule: z.string().regex(/^[a-z_.]{1,40}$/), class: z.enum(["base", "pattern", "professional"]).optional(),
      outcome: z.enum(["applied", "dismissed", "undone"]), mode: z.enum(["corporate_base", "corporate_full"]),
      style_id: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable(), occurred_at: z.number().int(),
    }).strict()).min(1).max(50) }).strict());
    // The client sends milliseconds; the table stores seconds. Times far from now are refused.
    const stamped = events.map((e) => ({ ...e, at: e.occurred_at > 1e11 ? Math.floor(e.occurred_at / 1000) : e.occurred_at }));
    if (stamped.some((e) => e.at < t - 7 * 86400 || e.at > t + 300)) return c.json({ error: { code: "bad_time", message: "Event times are out of range." } }, 400);
    let link = await c.env.DB.prepare("SELECT pseudo_id FROM learning_link WHERE user_id = ?1").bind(u.id).first<{ pseudo_id: string }>();
    if (!link) {
      const pseudo = crypto.randomUUID().replace(/-/g, "");
      await c.env.DB.prepare("INSERT OR IGNORE INTO learning_link (user_id, pseudo_id) VALUES (?1, ?2)").bind(u.id, pseudo).run();
      link = await c.env.DB.prepare("SELECT pseudo_id FROM learning_link WHERE user_id = ?1").bind(u.id).first<{ pseudo_id: string }>();
    }
    await c.env.DB.batch(stamped.map((e) => c.env.DB.prepare("INSERT INTO learning_events (pseudo_id, command_id, mode, style_id, outcome, occurred_at) VALUES (?1,?2,?3,?4,?5,?6)").bind(link!.pseudo_id, e.rule, e.mode, e.style_id, e.outcome, e.at)));
    return c.json({ accepted: stamped.length }, 202);
  });
}
