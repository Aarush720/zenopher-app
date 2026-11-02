import type { Hono } from "hono";
import { z } from "zod";
import { authenticate, jsonBody, mustBeActive, route, type AppEnv } from "../app";
import { rateLimit } from "../db";
import { ApiError, notFound } from "../errors";
import { settings } from "../env";
import { now } from "../util";

export function accountRoutes(app: Hono<AppEnv>) {
  app.get("/v1/account", async (c) => {
    route(c, "GET /v1/account");
    const u = await authenticate(c);
    const r = await c.env.DB.prepare("SELECT id, email, email_verified, display_name, status, deletion_at, created_at FROM users WHERE id = ?1").bind(u.id).first();
    return c.json(r as object);
  });

  app.patch("/v1/account", async (c) => {
    route(c, "PATCH /v1/account");
    const u = await authenticate(c); mustBeActive(u);
    const b = await jsonBody(c, z.object({ display_name: z.string().trim().min(1).max(100) }).strict());
    await c.env.DB.prepare("UPDATE users SET display_name = ?2, updated_at = ?3 WHERE id = ?1").bind(u.id, b.display_name, now()).run();
    return c.json({ ok: true });
  });

  // Export and deletion are queued and handled by the cron worker in batches.
  app.post("/v1/account/export", async (c) => {
    route(c, "POST /v1/account/export");
    const u = await authenticate(c);
    await rateLimit(c.env.DB, `export:${u.id}`, 3, 86400);
    const open = await c.env.DB.prepare("SELECT id FROM jobs WHERE user_id = ?1 AND kind = 'export' AND status IN ('queued','running')").bind(u.id).first<{ id: number }>();
    if (open) return c.json({ id: open.id, status: "queued" }, 202);
    const t = now();
    const r = await c.env.DB.prepare("INSERT INTO jobs (kind, user_id, status, attempts, run_after, created_at) VALUES ('export', ?1, 'queued', 0, ?2, ?2) RETURNING id").bind(u.id, t).first<{ id: number }>();
    return c.json({ id: r!.id, status: "queued" }, 202);
  });

  app.get("/v1/account/export/:job", async (c) => {
    route(c, "GET /v1/account/export/:job");
    const u = await authenticate(c);
    const j = await c.env.DB.prepare("SELECT id, status FROM jobs WHERE id = ?1 AND user_id = ?2 AND kind = 'export'").bind(Number(c.req.param("job")), u.id).first<{ id: number; status: string }>();
    if (!j) throw notFound();
    return c.json({ id: j.id, status: j.status });
  });

  app.get("/v1/account/export/:job/download", async (c) => {
    route(c, "GET /v1/account/export/:job/download");
    const u = await authenticate(c);
    const j = await c.env.DB.prepare("SELECT id FROM jobs WHERE id = ?1 AND user_id = ?2 AND kind = 'export' AND status = 'done'").bind(Number(c.req.param("job")), u.id).first<{ id: number }>();
    const obj = j ? await c.env.BUCKET.get(`exports/${u.id}/${j.id}.tar`) : null;
    if (!obj) throw notFound();
    return new Response(obj.body, { headers: { "content-type": "application/x-tar", "content-disposition": 'attachment; filename="zenopher-export.tar"', "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'", "cache-control": "private, no-store" } });
  });

  // Deletion has a grace period. Signing in and cancelling restores the account.
  app.post("/v1/account/delete", async (c) => {
    route(c, "POST /v1/account/delete");
    const u = await authenticate(c);
    await jsonBody(c, z.object({ confirm: z.literal("delete my account") }).strict());
    const at = now() + settings(c.env).deletionGraceDays * 86400;
    await c.env.DB.prepare("UPDATE users SET status = 'pending_deletion', deletion_at = ?2, updated_at = ?3 WHERE id = ?1").bind(u.id, at, now()).run();
    return c.json({ status: "pending_deletion", deletion_at: at });
  });

  app.post("/v1/account/delete/cancel", async (c) => {
    route(c, "POST /v1/account/delete/cancel");
    const u = await authenticate(c);
    const r = await c.env.DB.prepare("UPDATE users SET status = 'active', deletion_at = NULL, updated_at = ?2 WHERE id = ?1 AND status = 'pending_deletion'").bind(u.id, now()).run();
    if (r.meta.changes !== 1) throw new ApiError(409, "not_pending", "No deletion is scheduled.");
    return c.json({ status: "active" });
  });
}
