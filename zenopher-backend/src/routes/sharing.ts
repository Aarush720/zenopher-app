import type { Hono } from "hono";
import { z } from "zod";
import { authenticate, clientIp, jsonBody, mustBeActive, route, type AppEnv, type Ctx } from "../app";
import { hashId } from "../crypto";
import { rateLimit } from "../db";
import { ApiError, notFound } from "../errors";
import { settings } from "../env";
import { now, randomId, randomToken, sha256Hex } from "../util";
import { findDesign, publicMeta, readVersion, type DesignRow } from "./designs";

const MAX_ACTIVE_SHARES = 20;

async function viaLinkToken(c: Ctx): Promise<DesignRow> {
  const token = c.req.header("x-share-token") ?? "";
  if (token.length < 20 || token.length > 100) throw notFound();
  const th = await sha256Hex(token);
  await rateLimit(c.env.DB, `share:view:${await hashId(c.env, clientIp(c) + th)}`, 120, 60);
  const row = await c.env.DB.prepare(
    `SELECT d.*, 'viewer' AS role FROM share_grants g JOIN designs d ON d.id = g.design_id
     WHERE g.token_hash = ?1 AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > ?2) AND d.trashed_at IS NULL`).bind(th, now()).first<DesignRow>();
  if (!row) throw notFound();
  return row;
}

export function sharingRoutes(app: Hono<AppEnv>) {
  app.post("/v1/designs/:id/shares", async (c) => {
    route(c, "POST /v1/designs/:id/shares");
    const u = await authenticate(c); mustBeActive(u);
    const d = await findDesign(c.env.DB, c.req.param("id"), u.id);
    if (!d || d.role !== "owner" || d.trashed_at) throw notFound();
    await rateLimit(c.env.DB, `shares:create:${u.id}`, 30, 3600);
    const b = await jsonBody(c, z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("link"), permission: z.enum(["view", "comment"]), expires_in_days: z.number().int().min(1).max(365).optional() }).strict(),
      z.object({ kind: z.literal("user"), email: z.string().trim().toLowerCase().email().max(254), permission: z.enum(["view", "comment"]), expires_in_days: z.number().int().min(1).max(365).optional() }).strict(),
    ]));
    const active = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM share_grants WHERE design_id = ?1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?2)").bind(d.id, now()).first<{ n: number }>();
    if ((active?.n ?? 0) >= MAX_ACTIVE_SHARES) throw new ApiError(409, "too_many_shares", "This design has too many active shares.");
    const t = now(), id = randomId(), expires = b.expires_in_days ? t + b.expires_in_days * 86400 : null;
    if (b.kind === "link") {
      const token = randomToken(); // shown once; only its hash is kept
      await c.env.DB.prepare("INSERT INTO share_grants (id, design_id, grantee_user_id, token_hash, permission, expires_at, revoked_at, created_at) VALUES (?1,?2,NULL,?3,?4,?5,NULL,?6)").bind(id, d.id, await sha256Hex(token), b.permission, expires, t).run();
      // The token goes in the URL fragment so it is not sent to any server or Referer.
      return c.json({ id, token, url: `${settings(c.env).appOrigin}/shared#${token}` }, 201);
    }
    // The reply is the same whether or not that email has an account, so this cannot be used to look up who is registered.
    const target = await c.env.DB.prepare("SELECT id FROM users WHERE email = ?1 AND status = 'active'").bind(b.email).first<{ id: string }>();
    if (target && target.id !== u.id) {
      await c.env.DB.prepare("INSERT INTO share_grants (id, design_id, grantee_user_id, token_hash, permission, expires_at, revoked_at, created_at) VALUES (?1,?2,?3,NULL,?4,?5,NULL,?6)").bind(id, d.id, target.id, b.permission, expires, t).run();
    }
    return c.json({ ok: true }, 202);
  });

  app.get("/v1/designs/:id/shares", async (c) => {
    route(c, "GET /v1/designs/:id/shares");
    const u = await authenticate(c);
    const d = await findDesign(c.env.DB, c.req.param("id"), u.id);
    if (!d || d.role !== "owner") throw notFound();
    const rows = await c.env.DB.prepare(
      `SELECT g.id, g.permission, g.expires_at, g.revoked_at, g.created_at, CASE WHEN g.token_hash IS NULL THEN 'user' ELSE 'link' END AS kind, u.email AS grantee_email
       FROM share_grants g LEFT JOIN users u ON u.id = g.grantee_user_id WHERE g.design_id = ?1 ORDER BY g.created_at DESC LIMIT 100`).bind(d.id).all();
    return c.json({ shares: rows.results });
  });

  app.delete("/v1/designs/:id/shares/:shareId", async (c) => {
    route(c, "DELETE /v1/designs/:id/shares/:shareId");
    const u = await authenticate(c); mustBeActive(u);
    const r = await c.env.DB.prepare("UPDATE share_grants SET revoked_at = ?3 WHERE id = ?1 AND revoked_at IS NULL AND design_id IN (SELECT id FROM designs WHERE id = ?2 AND owner_id = ?4)")
      .bind(c.req.param("shareId"), c.req.param("id"), now(), u.id).run();
    if (r.meta.changes !== 1) throw notFound();
    return new Response(null, { status: 204 });
  });

  // Anonymous access with a link token (sent in a header, never in the path or query).
  app.get("/v1/shared/design", async (c) => {
    route(c, "GET /v1/shared/design");
    return c.json(publicMeta(await viaLinkToken(c)));
  });
  app.get("/v1/shared/content", async (c) => {
    route(c, "GET /v1/shared/content");
    const d = await viaLinkToken(c);
    if (d.current_version < 1) throw notFound();
    return readVersion(c, d, d.current_version);
  });
}
