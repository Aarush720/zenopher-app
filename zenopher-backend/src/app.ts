import { Hono, type Context } from "hono";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { ApiError, badRequest, unauthorized } from "./errors";
import { settings, type Env } from "./env";
import { logError, logRequest } from "./log";
import { verifyAccess } from "./crypto";
import { now, randomId } from "./util";

export interface AppVars { requestId: string; userId?: string; routeName: string; errorCode?: string }
export type AppEnv = { Bindings: Env; Variables: AppVars };
export type Ctx = Context<AppEnv>;

export function createApp() {
  const app = new Hono<AppEnv>();

  // Request id, CORS, security headers, one log line per request (spec 8.6, 8.8).
  app.use("*", async (c, next) => {
    const started = Date.now();
    c.set("requestId", randomId().slice(0, 16));
    c.set("routeName", "unmatched");
    const origin = c.req.header("origin");
    const allowed = settings(c.env).allowedOrigins;
    const originOk = !!origin && allowed.includes(origin);
    if (c.req.method === "OPTIONS") {
      const h = new Headers({ vary: "Origin", "access-control-max-age": "600" });
      if (originOk) {
        h.set("access-control-allow-origin", origin!);
        h.set("access-control-allow-credentials", "true");
        h.set("access-control-allow-methods", "GET, POST, PUT, PATCH, DELETE");
        h.set("access-control-allow-headers", "authorization, content-type, idempotency-key, x-base-version, x-content-hash, x-share-token");
      }
      return new Response(null, { status: 204, headers: h });
    }
    await next();
    const h = c.res.headers;
    h.set("vary", "Origin");
    if (originOk) {
      h.set("access-control-allow-origin", origin!);
      h.set("access-control-allow-credentials", "true");
      h.set("access-control-expose-headers", "x-design-version, x-content-hash, x-request-id, retry-after");
    }
    h.set("strict-transport-security", "max-age=63072000; includeSubDomains");
    h.set("x-content-type-options", "nosniff");
    h.set("referrer-policy", "strict-origin-when-cross-origin");
    if (!h.has("content-security-policy")) h.set("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    if (!h.has("cache-control")) h.set("cache-control", "no-store");
    h.set("x-request-id", c.get("requestId"));
    logRequest({ request_id: c.get("requestId"), route: c.get("routeName"), status: c.res.status, latency_ms: Date.now() - started, user_id: c.get("userId"), error_code: c.get("errorCode") });
  });

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      c.set("errorCode", err.code);
      const headers: Record<string, string> = {};
      if (err.code === "rate_limited" && typeof err.extra?.retry_after === "number") headers["retry-after"] = String(err.extra.retry_after);
      return c.json({ error: { code: err.code, message: err.message, ...err.extra } }, err.status as 400, headers);
    }
    if (err instanceof ZodError) {
      c.set("errorCode", "invalid_request");
      // Field paths only. Submitted values are never echoed.
      return c.json({ error: { code: "invalid_request", message: "The request is not valid.", fields: [...new Set(err.issues.map((i) => i.path.join(".") || "(body)"))] } }, 400);
    }
    c.set("errorCode", "internal");
    logError(c.get("requestId"), c.get("routeName"), err);
    return c.json({ error: { code: "internal", message: "Something went wrong." } }, 500);
  });

  app.notFound((c) => { c.set("errorCode", "not_found"); return c.json({ error: { code: "not_found", message: "Not found." } }, 404); });
  return app;
}

/** Name the route for the log line, using the pattern rather than the path so ids and tokens never get logged. */
export const route = (c: Ctx, name: string) => c.set("routeName", name);

/** Parse a JSON body against a strict schema (unknown fields rejected). Bodies are capped at 64 KB. */
export async function jsonBody<S extends ZodTypeAny>(c: Ctx, schema: S): Promise<z.infer<S>> {
  const len = Number(c.req.header("content-length") ?? "0");
  if (len > 65536) throw new ApiError(413, "too_large", "The request is too large.");
  if (!(c.req.header("content-type") ?? "").toLowerCase().startsWith("application/json")) throw badRequest("bad_content_type", "Send JSON.");
  const text = await c.req.text();
  if (text.length > 65536) throw new ApiError(413, "too_large", "The request is too large.");
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw badRequest("bad_json", "The request is not valid JSON."); }
  return schema.parse(data);
}

/** Checks the declared size before reading the body, then the real size after (spec 8.4). */
export async function rawBody(c: Ctx, max: number): Promise<Uint8Array> {
  const declared = c.req.header("content-length");
  if (declared === undefined) throw new ApiError(411, "length_required", "Content-Length is required.");
  if (!/^\d+$/.test(declared) || Number(declared) > max) throw new ApiError(413, "too_large", "The upload is too large.");
  const body = new Uint8Array(await c.req.arrayBuffer());
  if (body.length > max) throw new ApiError(413, "too_large", "The upload is too large.");
  return body;
}

export interface AuthUser { id: string; fam: string; status: "active" | "pending_deletion"; verified: boolean }

/** Signed access token, plus a check that the session family is still live. Revocation takes effect at once. */
export async function authenticate(c: Ctx): Promise<AuthUser> {
  const h = c.req.header("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const claims = token ? await verifyAccess(c.env, token, now()) : null;
  if (!claims) throw unauthorized();
  const row = await c.env.DB
    .prepare(
      `SELECT u.status AS status, u.email_verified AS verified FROM users u
       WHERE u.id = ?1 AND EXISTS (SELECT 1 FROM sessions s WHERE s.family_id = ?2 AND s.user_id = ?1 AND s.revoked_at IS NULL AND s.expires_at > ?3)`,
    )
    .bind(claims.uid, claims.fam, now())
    .first<{ status: "active" | "pending_deletion"; verified: number }>();
  if (!row) throw unauthorized();
  c.set("userId", claims.uid);
  return { id: claims.uid, fam: claims.fam, status: row.status, verified: row.verified === 1 };
}

/** Writes are refused while an account is waiting for deletion. */
export function mustBeActive(u: AuthUser): void {
  if (u.status !== "active") throw new ApiError(403, "account_pending_deletion", "This account is scheduled for deletion. Cancel the deletion to continue.");
}

export const clientIp = (c: Ctx) => c.req.header("cf-connecting-ip") ?? "unknown";
