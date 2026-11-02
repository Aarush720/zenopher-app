import type { Hono } from "hono";
import { z } from "zod";
import { authenticate, jsonBody, mustBeActive, rawBody, route, type AppEnv, type Ctx } from "../app";
import { decryptBlob, encryptBlob, newDek, unwrapDek } from "../crypto";
import { idempotent, rateLimit } from "../db";
import { ApiError, badRequest, notFound } from "../errors";
import { settings } from "../env";
import { pngSize, sniff } from "../services/upload";
import { now, randomId, sha256Hex, toU8, UUID_RE } from "../util";

const STYLE_REF = /^[a-z0-9-]{1,40}@\d{1,4}$/;

export interface DesignRow {
  id: string; owner_id: string; title: string; mode: string; style_id: string | null; width_px: number; height_px: number;
  current_version: number; wrapped_dek: unknown; trashed_at: number | null; created_at: number; updated_at: number; role: "owner" | "viewer";
}

/** Owner, or someone with an active grant on a design that is not in the trash. Not-found and forbidden look the same (8.3). */
export async function findDesign(db: D1Database, id: string, userId: string): Promise<DesignRow | null> {
  return db
    .prepare(
      `SELECT d.*, CASE WHEN d.owner_id = ?2 THEN 'owner' ELSE 'viewer' END AS role FROM designs d
       WHERE d.id = ?1 AND (d.owner_id = ?2 OR (d.trashed_at IS NULL AND EXISTS (
         SELECT 1 FROM share_grants g WHERE g.design_id = d.id AND g.grantee_user_id = ?2 AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > ?3))))`,
    )
    .bind(id, userId, now())
    .first<DesignRow>();
}

export const publicMeta = (d: Omit<DesignRow, "wrapped_dek" | "owner_id" | "role"> & Partial<Pick<DesignRow, "role">>) => ({
  id: d.id, title: d.title, mode: d.mode, style_id: d.style_id, width_px: d.width_px, height_px: d.height_px,
  current_version: d.current_version, trashed_at: d.trashed_at, created_at: d.created_at, updated_at: d.updated_at, ...(d.role ? { role: d.role } : {}),
});

async function ownedDesign(c: Ctx, userId: string): Promise<DesignRow> {
  const d = await findDesign(c.env.DB, c.req.param("id")!, userId);
  if (!d || d.role !== "owner") throw notFound();
  return d;
}

/** Streams a stored version back, decrypted. */
export async function readVersion(c: Ctx, d: Pick<DesignRow, "id" | "wrapped_dek" | "current_version">, version: number): Promise<Response> {
  const v = await c.env.DB.prepare("SELECT r2_key, content_hash FROM design_versions WHERE design_id = ?1 AND version = ?2").bind(d.id, version).first<{ r2_key: string; content_hash: string }>();
  if (!v) throw notFound();
  const obj = await c.env.BUCKET.get(v.r2_key);
  if (!obj) throw notFound();
  const dek = await unwrapDek(c.env, d.id, toU8(d.wrapped_dek));
  const plain = await decryptBlob(dek, d.id, version, new Uint8Array(await obj.arrayBuffer()));
  return new Response(plain, {
    headers: {
      "content-type": "application/octet-stream", "content-disposition": 'attachment; filename="design.zph"', "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'", "x-design-version": String(version), "x-content-hash": v.content_hash, etag: `"${v.content_hash}"`, "cache-control": "private, no-store",
    },
  });
}

export function designRoutes(app: Hono<AppEnv>) {
  app.post("/v1/designs", async (c) => {
    route(c, "POST /v1/designs");
    const u = await authenticate(c); mustBeActive(u);
    const b = await jsonBody(c, z.object({
      id: z.string().regex(UUID_RE), title: z.string().trim().min(1).max(200), mode: z.enum(["creative", "corporate"]),
      style_id: z.string().regex(STYLE_REF).nullable().optional(), width_px: z.number().int().min(1).max(16384), height_px: z.number().int().min(1).max(16384),
    }).strict());
    await rateLimit(c.env.DB, `designs:create:${u.id}`, 60, 3600);
    const { wrapped } = await newDek(c.env, b.id);
    const t = now();
    try {
      await c.env.DB.prepare("INSERT INTO designs (id, owner_id, title, mode, style_id, width_px, height_px, current_version, wrapped_dek, trashed_at, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8,NULL,?9,?9)")
        .bind(b.id, u.id, b.title, b.mode, b.style_id ?? null, b.width_px, b.height_px, wrapped, t).run();
    } catch { throw new ApiError(409, "id_taken", "That design id is already in use."); }
    return c.json(publicMeta({ id: b.id, title: b.title, mode: b.mode, style_id: b.style_id ?? null, width_px: b.width_px, height_px: b.height_px, current_version: 0, trashed_at: null, created_at: t, updated_at: t }), 201);
  });

  app.get("/v1/designs", async (c) => {
    route(c, "GET /v1/designs");
    const u = await authenticate(c);
    const trashed = c.req.query("trashed") === "1";
    const rows = await c.env.DB.prepare(`SELECT id, title, mode, style_id, width_px, height_px, current_version, trashed_at, created_at, updated_at FROM designs WHERE owner_id = ?1 AND trashed_at IS ${trashed ? "NOT" : ""} NULL ORDER BY updated_at DESC, id LIMIT 200`).bind(u.id).all();
    return c.json({ designs: rows.results.map((r) => publicMeta(r as never)) });
  });

  // Designs others shared with this user. Appears once collaboration exists.
  app.get("/v1/designs/shared", async (c) => {
    route(c, "GET /v1/designs/shared");
    const u = await authenticate(c);
    const rows = await c.env.DB.prepare(
      `SELECT DISTINCT d.id, d.title, d.mode, d.style_id, d.width_px, d.height_px, d.current_version, d.trashed_at, d.created_at, d.updated_at FROM designs d
       JOIN share_grants g ON g.design_id = d.id WHERE g.grantee_user_id = ?1 AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at > ?2) AND d.trashed_at IS NULL
       ORDER BY d.updated_at DESC LIMIT 200`).bind(u.id, now()).all();
    return c.json({ designs: rows.results.map((r) => publicMeta({ ...(r as Record<string, any>), role: "viewer" } as never)) });
  });

  app.get("/v1/designs/:id", async (c) => {
    route(c, "GET /v1/designs/:id");
    const u = await authenticate(c);
    const d = await findDesign(c.env.DB, c.req.param("id"), u.id);
    if (!d) throw notFound();
    return c.json(publicMeta(d));
  });

  app.patch("/v1/designs/:id", async (c) => {
    route(c, "PATCH /v1/designs/:id");
    const u = await authenticate(c); mustBeActive(u);
    const d = await ownedDesign(c, u.id);
    if (d.trashed_at) throw notFound();
    const b = await jsonBody(c, z.object({ title: z.string().trim().min(1).max(200).optional(), mode: z.enum(["creative", "corporate"]).optional(), style_id: z.string().regex(STYLE_REF).nullable().optional() }).strict());
    await c.env.DB.prepare("UPDATE designs SET title = ?2, mode = ?3, style_id = ?4, updated_at = ?5 WHERE id = ?1 AND owner_id = ?6")
      .bind(d.id, b.title ?? d.title, b.mode ?? d.mode, b.style_id === undefined ? d.style_id : b.style_id, now(), u.id).run();
    return c.json({ ok: true });
  });

  app.post("/v1/designs/:id/trash", async (c) => {
    route(c, "POST /v1/designs/:id/trash");
    const u = await authenticate(c); mustBeActive(u);
    const r = await c.env.DB.prepare("UPDATE designs SET trashed_at = ?3, updated_at = ?3 WHERE id = ?1 AND owner_id = ?2 AND trashed_at IS NULL").bind(c.req.param("id"), u.id, now()).run();
    if (r.meta.changes !== 1) throw notFound();
    return c.json({ ok: true });
  });

  app.post("/v1/designs/:id/restore", async (c) => {
    route(c, "POST /v1/designs/:id/restore");
    const u = await authenticate(c); mustBeActive(u);
    const r = await c.env.DB.prepare("UPDATE designs SET trashed_at = NULL, updated_at = ?3 WHERE id = ?1 AND owner_id = ?2 AND trashed_at IS NOT NULL").bind(c.req.param("id"), u.id, now()).run();
    if (r.meta.changes !== 1) throw notFound();
    return c.json({ ok: true });
  });

  // Permanent deletion is allowed from the trash only.
  app.delete("/v1/designs/:id", async (c) => {
    route(c, "DELETE /v1/designs/:id");
    const u = await authenticate(c); mustBeActive(u);
    const d = await ownedDesign(c, u.id);
    if (!d.trashed_at) throw new ApiError(409, "not_in_trash", "Move the design to the trash first.");
    await purgeDesign(c.env, d.id);
    return new Response(null, { status: 204 });
  });

  // 10.2 Save a version.
  app.post("/v1/designs/:id/versions", async (c) => {
    route(c, "POST /v1/designs/:id/versions");
    const u = await authenticate(c); mustBeActive(u);
    const s = settings(c.env);
    const res = await idempotent(c.env.DB, u.id, c.req.header("idempotency-key"), async () => {
      const baseHeader = c.req.header("x-base-version") ?? "";
      const claimedHash = (c.req.header("x-content-hash") ?? "").toLowerCase();
      if (!/^\d{1,9}$/.test(baseHeader) || !/^[0-9a-f]{64}$/.test(claimedHash)) throw badRequest("bad_headers", "X-Base-Version and X-Content-Hash are required.");
      const base = Number(baseHeader);
      const d = await ownedDesign(c, u.id); // ownership; edit grants do not exist yet
      if (d.trashed_at) throw notFound();
      await rateLimit(c.env.DB, `save:design:${d.id}`, 12, 60); // 12 per minute per design
      if (base !== d.current_version) return { status: 409, body: { error: { code: "version_conflict", message: "The design changed elsewhere.", current_version: d.current_version } } };
      const body = await rawBody(c, s.maxVersionBytes);
      if (body.length < 18 || sniff(body) !== "application/gzip") throw badRequest("bad_document", "The document must be gzip-compressed.");
      if ((await sha256Hex(body)) !== claimedHash) throw badRequest("hash_mismatch", "The document did not match its hash.");
      const next = base + 1;
      const dek = await unwrapDek(c.env, d.id, toU8(d.wrapped_dek));
      const sealed = await encryptBlob(dek, d.id, next, body);
      const key = `v/${d.id}/${next}-${randomId()}`; // server-generated, never from user input
      await c.env.BUCKET.put(key, sealed);
      const t = now();
      // One batch: the version row is inserted only if the pointer actually moved (changes() = 1).
      const [moved] = await c.env.DB.batch([
        c.env.DB.prepare("UPDATE designs SET current_version = ?1, updated_at = ?2 WHERE id = ?3 AND current_version = ?4").bind(next, t, d.id, base),
        c.env.DB.prepare("INSERT INTO design_versions (design_id, version, r2_key, byte_size, content_hash, created_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE changes() = 1").bind(d.id, next, key, sealed.length, claimedHash, t),
      ]);
      if (moved!.meta.changes !== 1) {
        await c.env.BUCKET.delete(key);
        const cur = await c.env.DB.prepare("SELECT current_version FROM designs WHERE id = ?1").bind(d.id).first<{ current_version: number }>();
        return { status: 409, body: { error: { code: "version_conflict", message: "The design changed elsewhere.", current_version: cur?.current_version ?? null } } };
      }
      return { status: 201, body: { version: next, content_hash: claimedHash } };
    });
    return c.json(res.body as object, res.status as 201);
  });

  app.get("/v1/designs/:id/content", async (c) => {
    route(c, "GET /v1/designs/:id/content");
    const u = await authenticate(c);
    const d = await findDesign(c.env.DB, c.req.param("id"), u.id);
    if (!d) throw notFound();
    const q = c.req.query("version");
    const version = q === undefined ? d.current_version : Number(q);
    if (!Number.isInteger(version) || version < 1 || (d.role !== "owner" && version !== d.current_version)) throw notFound();
    return readVersion(c, d, version);
  });

  app.get("/v1/designs/:id/versions", async (c) => {
    route(c, "GET /v1/designs/:id/versions");
    const u = await authenticate(c);
    const d = await ownedDesign(c, u.id);
    const rows = await c.env.DB.prepare("SELECT version, byte_size, content_hash, created_at FROM design_versions WHERE design_id = ?1 ORDER BY version DESC LIMIT 100").bind(d.id).all();
    return c.json({ versions: rows.results });
  });

  // Thumbnails are generated in the browser. The server checks the PNG signature and size only.
  app.put("/v1/designs/:id/thumbnail", async (c) => {
    route(c, "PUT /v1/designs/:id/thumbnail");
    const u = await authenticate(c); mustBeActive(u);
    const d = await ownedDesign(c, u.id);
    const body = await rawBody(c, settings(c.env).maxThumbnailBytes);
    if (!pngSize(body)) throw badRequest("bad_thumbnail", "The thumbnail must be a PNG.");
    await c.env.BUCKET.put(`t/${d.id}`, body, { httpMetadata: { contentType: "image/png" } });
    return new Response(null, { status: 204 });
  });

  app.get("/v1/designs/:id/thumbnail", async (c) => {
    route(c, "GET /v1/designs/:id/thumbnail");
    const u = await authenticate(c);
    const d = await findDesign(c.env.DB, c.req.param("id"), u.id);
    if (!d) throw notFound();
    const obj = await c.env.BUCKET.get(`t/${d.id}`);
    if (!obj) throw notFound();
    return new Response(obj.body, { headers: { "content-type": "image/png", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'", "cache-control": "private, max-age=60" } });
  });
}

/** Removes a design, its versions, its shares, and every R2 object. Used by permanent delete and the trash purge. */
export async function purgeDesign(env: import("../env").Env, designId: string): Promise<void> {
  const keys = (await env.DB.prepare("SELECT r2_key FROM design_versions WHERE design_id = ?1").bind(designId).all<{ r2_key: string }>()).results.map((r) => r.r2_key);
  for (let i = 0; i < keys.length; i += 500) await env.BUCKET.delete(keys.slice(i, i + 500));
  await env.BUCKET.delete(`t/${designId}`);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM share_grants WHERE design_id = ?1").bind(designId),
    env.DB.prepare("DELETE FROM design_versions WHERE design_id = ?1").bind(designId),
    env.DB.prepare("DELETE FROM designs WHERE id = ?1").bind(designId),
  ]);
}
