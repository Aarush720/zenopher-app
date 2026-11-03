import type { Hono } from "hono";
import { authenticate, mustBeActive, rawBody, route, type AppEnv, type Ctx } from "../app";
import { rateLimit } from "../db";
import { ApiError, notFound, unauthorized } from "../errors";
import { settings } from "../env";
import { ASSET_TYPES, declaredType, sniff, userFileHeaders, type AssetType } from "../services/upload";
import { deleteStoredObject, putStoredObject } from "../storage";
import { now, randomId, sha256Hex } from "../util";

const USER_QUOTA_BYTES = 200 * 1024 * 1024;

/** Link-share viewers may read the owner's assets. Asset ids are 128-bit random, so only ids found inside a shared design are known. */
async function canRead(c: Ctx, assetOwner: string): Promise<boolean> {
  const t = now();
  const token = c.req.header("x-share-token");
  if (token) {
    const ok = await c.env.DB.prepare(
      `SELECT 1 AS ok FROM share_grants g JOIN designs d ON d.id = g.design_id
       WHERE g.token_hash = ?1 AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > ?2) AND d.owner_id = ?3 AND d.trashed_at IS NULL`).bind(await sha256Hex(token), t, assetOwner).first();
    return !!ok;
  }
  const u = await authenticate(c);
  if (u.id === assetOwner) return true;
  const ok = await c.env.DB.prepare(
    `SELECT 1 AS ok FROM share_grants g JOIN designs d ON d.id = g.design_id
     WHERE g.grantee_user_id = ?1 AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > ?2) AND d.owner_id = ?3 AND d.trashed_at IS NULL`).bind(u.id, t, assetOwner).first();
  return !!ok;
}

export function assetRoutes(app: Hono<AppEnv>) {
  // Uploads (spec 8.4): allow-list of types, magic bytes against the declared type, declared size first, server-made keys.
  app.post("/v1/assets", async (c) => {
    route(c, "POST /v1/assets");
    const u = await authenticate(c); mustBeActive(u);
    await rateLimit(c.env.DB, `assets:upload:${u.id}`, 60, 60);
    const s = settings(c.env);
    const type = declaredType(c.req.raw);
    if (!(ASSET_TYPES as readonly string[]).includes(type)) throw new ApiError(415, "unsupported_type", "This file type is not accepted.");
    const body = await rawBody(c, s.maxAssetBytes);
    if (sniff(body) !== (type as AssetType)) throw new ApiError(415, "type_mismatch", "The file does not match its type.");
    const used = await c.env.DB.prepare("SELECT COALESCE(SUM(byte_size), 0) AS n FROM assets WHERE owner_id = ?1").bind(u.id).first<{ n: number }>();
    if ((used?.n ?? 0) + body.length > USER_QUOTA_BYTES) throw new ApiError(413, "quota_exceeded", "You have reached your storage limit.");
    const id = randomId(), key = `a/${id}`, t = now();
    await c.env.DB.prepare("INSERT INTO assets (id, owner_id, r2_key, mime, byte_size, status, created_at) VALUES (?1,?2,?3,?4,?5,'pending',?6)").bind(id, u.id, key, type, body.length, t).run();
    await putStoredObject(c.env, key, body, { httpMetadata: { contentType: type } });
    await c.env.DB.prepare("UPDATE assets SET status = 'ready' WHERE id = ?1").bind(id).run();
    return c.json({ id, mime: type, byte_size: body.length }, 201);
  });

  app.get("/v1/assets/:id", async (c) => {
    route(c, "GET /v1/assets/:id");
    if (!c.req.header("x-share-token") && !c.req.header("authorization")) throw unauthorized();
    const a = await c.env.DB.prepare("SELECT id, owner_id, r2_key, mime FROM assets WHERE id = ?1 AND status = 'ready'").bind(c.req.param("id")).first<{ id: string; owner_id: string; r2_key: string; mime: string }>();
    if (!a || !(await canRead(c, a.owner_id))) throw notFound();
    const obj = await c.env.BUCKET.get(a.r2_key);
    if (!obj) throw notFound();
    return new Response(obj.body, { headers: { ...userFileHeaders(a.mime, "asset"), "cache-control": "private, max-age=3600" } });
  });

  app.delete("/v1/assets/:id", async (c) => {
    route(c, "DELETE /v1/assets/:id");
    const u = await authenticate(c); mustBeActive(u);
    const a = await c.env.DB.prepare("SELECT r2_key, byte_size FROM assets WHERE id = ?1 AND owner_id = ?2").bind(c.req.param("id"), u.id).first<{ r2_key: string; byte_size: number }>();
    if (!a) throw notFound();
    await deleteStoredObject(c.env, a.r2_key, a.byte_size);
    await c.env.DB.prepare("DELETE FROM assets WHERE id = ?1 AND owner_id = ?2").bind(c.req.param("id"), u.id).run();
    return new Response(null, { status: 204 });
  });
}
