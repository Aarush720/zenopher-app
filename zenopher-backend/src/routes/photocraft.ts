import type { Hono } from "hono";
import { route, type AppEnv, type Ctx } from "../app";
import { settings } from "../env";
import { notFound } from "../errors";

const FILES = {
  "index.html": {
    key: "photocraft/index.html",
    type: "text/html; charset=utf-8",
    cache: "no-cache",
    html: true,
  },
  "photocraft-web.js": {
    key: "photocraft/photocraft-web.js",
    type: "text/javascript; charset=utf-8",
    cache: "public, max-age=31536000, immutable",
    html: false,
  },
  "photocraft-web_bg.wasm": {
    key: "photocraft/photocraft-web_bg.wasm",
    type: "application/wasm",
    cache: "public, max-age=31536000, immutable",
    html: false,
  },
} as const;

async function serve(c: Ctx, file: keyof typeof FILES): Promise<Response> {
  const descriptor = FILES[file];
  const object = await c.env.BUCKET.get(descriptor.key);
  if (!object) throw notFound();

  const headers = new Headers({
    "cache-control": descriptor.cache,
    "content-type": object.httpMetadata?.contentType ?? descriptor.type,
    etag: object.httpEtag,
    "cross-origin-resource-policy": "cross-origin",
  });

  if (c.req.header("if-none-match") === object.httpEtag) return new Response(null, { status: 304, headers });

  if (descriptor.html) {
    const ancestors = settings(c.env).allowedOrigins.join(" ") || "'none'";
    headers.set(
      "content-security-policy",
      `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors ${ancestors}`,
    );
  }

  return new Response(object.body, { headers });
}

/** Serves the large Rust/WASM Creative Mode assets from R2 instead of Pages. */
export function photocraftRoutes(app: Hono<AppEnv>) {
  app.get("/photocraft/index.html", (c) => {
    route(c, "GET /photocraft/index.html");
    return serve(c, "index.html");
  });
  app.get("/photocraft/photocraft-web.js", (c) => {
    route(c, "GET /photocraft/photocraft-web.js");
    return serve(c, "photocraft-web.js");
  });
  app.get("/photocraft/photocraft-web_bg.wasm", (c) => {
    route(c, "GET /photocraft/photocraft-web_bg.wasm");
    return serve(c, "photocraft-web_bg.wasm");
  });
}
