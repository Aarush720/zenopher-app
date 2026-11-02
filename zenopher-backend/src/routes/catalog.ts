import type { Hono } from "hono";
import { route, type AppEnv, type Ctx } from "../app";
import { notFound } from "../errors";

const SEGMENT = /^[a-z0-9][a-z0-9._-]{0,60}$/;

async function serve(c: Ctx, key: string, cache: string, fallbackType: string): Promise<Response> {
  const obj = await c.env.BUCKET.get(key);
  if (!obj) throw notFound();
  const etag = obj.httpEtag;
  if (c.req.header("if-none-match") === etag) return new Response(null, { status: 304, headers: { etag, "cache-control": cache } });
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType ?? fallbackType, etag, "cache-control": cache, "content-security-policy": "default-src 'none'" } });
}

/** Styles and presets are versioned files in R2. A published style version never changes, so it caches forever. */
export function catalogRoutes(app: Hono<AppEnv>) {
  app.get("/v1/catalog/index", (c) => { route(c, "GET /v1/catalog/index"); return serve(c, "catalog/index.json", "public, max-age=3600", "application/json"); });
  app.get("/v1/catalog/styles/:id/:version", (c) => {
    route(c, "GET /v1/catalog/styles/:id/:version");
    const { id, version } = c.req.param();
    if (!SEGMENT.test(id) || !/^\d{1,4}$/.test(version)) throw notFound();
    return serve(c, `catalog/styles/${id}/${version}.json`, "public, max-age=31536000, immutable", "application/json");
  });
  app.get("/v1/catalog/examples/:style/:file", (c) => {
    route(c, "GET /v1/catalog/examples/:style/:file");
    const { style, file } = c.req.param();
    if (!SEGMENT.test(style) || !SEGMENT.test(file)) throw notFound();
    return serve(c, `catalog/examples/${style}/${file}`, "public, max-age=604800", "image/webp");
  });
}
