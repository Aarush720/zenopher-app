import type { Hono } from "hono";
import { z } from "zod";
import { authenticate, clientIp, jsonBody, route, type AppEnv, type Ctx } from "../app";
import { rateLimit } from "../db";
import { hashId } from "../crypto";
import { ApiError, badRequest, unauthorized } from "../errors";
import { settings, type Env } from "../env";
import { clearCookie, familyOfCookie, readRefreshCookie, revokeAll, revokeFamily, rotateSession, startSession, type Issued } from "../session";
import { sendMagicLink } from "../services/email";
import { exchangeGoogleCode } from "../services/google";
import { verifyTurnstile } from "../services/turnstile";
import { now, randomId, randomToken, sha256Hex } from "../util";

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const email = z.string().trim().toLowerCase().max(254).regex(EMAIL_RE);

/** Cookie endpoints need a trusted Origin: with SameSite=Strict this is a second lock against cross-site requests. */
function requireOrigin(c: Ctx): void {
  const o = c.req.header("origin");
  if (!o || !settings(c.env).allowedOrigins.includes(o)) throw new ApiError(403, "bad_origin", "This request is not allowed from here.");
}

function sessionResponse(c: Ctx, issued: Issued, user: { id: string; email: string; display_name: string }) {
  return c.json({ access_token: issued.accessToken, expires_in: issued.expiresIn, user }, 200, { "set-cookie": issued.cookie });
}

async function userByEmail(env: Env, addr: string) {
  return env.DB.prepare("SELECT id, email, display_name FROM users WHERE email = ?1").bind(addr).first<{ id: string; email: string; display_name: string }>();
}

async function createUser(env: Env, addr: string, name: string) {
  const t = now(), id = randomId();
  await env.DB.prepare("INSERT INTO users (id, email, email_verified, display_name, status, deletion_at, created_at, updated_at) VALUES (?1,?2,1,?3,'active',NULL,?4,?4)").bind(id, addr, name.slice(0, 100) || "Designer", t).run();
  return { id, email: addr, display_name: name.slice(0, 100) || "Designer" };
}

export function authRoutes(app: Hono<AppEnv>) {
  // 10.1 step 1-3: same response whether or not the account exists.
  app.post("/v1/auth/magic", async (c) => {
    route(c, "POST /v1/auth/magic");
    const { email: addr, turnstile_token } = await jsonBody(c, z.object({ email, turnstile_token: z.string().max(2100).optional() }).strict());
    const ip = clientIp(c);
    await rateLimit(c.env.DB, `magic:ip:${await hashId(c.env, ip)}`, 10, 3600);
    await rateLimit(c.env.DB, `magic:email:${await hashId(c.env, addr)}`, 5, 3600);
    if (settings(c.env).turnstileRequired && !(await verifyTurnstile(c.env, turnstile_token, ip))) throw badRequest("captcha_failed", "Please complete the check and try again.");
    const user = await userByEmail(c.env, addr);
    const token = randomToken();
    await c.env.DB.prepare("INSERT INTO auth_tokens (token_hash, user_id, purpose, email, expires_at, used_at) VALUES (?1,?2,'signin',?3,?4,NULL)")
      .bind(await sha256Hex(token), user?.id ?? null, addr, now() + settings(c.env).magicLinkTtl).run();
    // The token travels in the URL fragment, so it never reaches server logs or Referer headers.
    const link = `${settings(c.env).appOrigin}/auth/callback#token=${token}`;
    if (c.env.LOCAL_AUTH_ENABLED === "true") {
      // Local development has no mail provider. Returning the one-time link is
      // intentionally gated to the local-only config and never enabled by the
      // production Wrangler variables.
      console.log(JSON.stringify({ level: "info", event: "local_magic_link", email: addr }));
      return c.json({ ok: true, dev_link: link }, 202);
    }
    // Do not acknowledge the request until the provider has accepted the message. The previous
    // waitUntil-only implementation returned 202 even when the Worker had no email secret or
    // Resend rejected the sender, leaving users stuck on a false "Link sent" state.
    if (!(await sendMagicLink(c.env, addr, link))) {
      throw new ApiError(503, "email_unavailable", "Sign-in email is temporarily unavailable. Please try again later.");
    }
    return c.json({ ok: true }, 202);
  });

  // 10.1 step 4. A POST, so mail scanners that prefetch links cannot use the token up.
  app.post("/v1/auth/verify", async (c) => {
    route(c, "POST /v1/auth/verify");
    requireOrigin(c);
    const { token } = await jsonBody(c, z.object({ token: z.string().min(20).max(100) }).strict());
    await rateLimit(c.env.DB, `verify:ip:${await hashId(c.env, clientIp(c))}`, 30, 3600);
    const used = await c.env.DB.prepare("UPDATE auth_tokens SET used_at = ?2 WHERE token_hash = ?1 AND used_at IS NULL AND expires_at > ?2 AND purpose = 'signin' RETURNING email")
      .bind(await sha256Hex(token), now()).first<{ email: string }>();
    if (!used) throw badRequest("invalid_link", "This link has expired or was already used.");
    let user = await userByEmail(c.env, used.email);
    if (!user) user = await createUser(c.env, used.email, used.email.split("@")[0]!);
    else await c.env.DB.prepare("UPDATE users SET email_verified = 1, updated_at = ?2 WHERE id = ?1").bind(user.id, now()).run();
    return sessionResponse(c, await startSession(c.env, user.id, c.req.header("user-agent") ?? null), user);
  });

  app.post("/v1/auth/google", async (c) => {
    route(c, "POST /v1/auth/google");
    requireOrigin(c);
    const b = await jsonBody(c, z.object({ code: z.string().min(10).max(2000), code_verifier: z.string().min(43).max(128), redirect_uri: z.string().url().max(500) }).strict());
    await rateLimit(c.env.DB, `google:ip:${await hashId(c.env, clientIp(c))}`, 30, 3600);
    const g = await exchangeGoogleCode(c.env, b.code, b.code_verifier, b.redirect_uri);
    if (!g) throw badRequest("google_failed", "Google sign-in did not work. Please try again.");
    const linked = await c.env.DB.prepare("SELECT u.id, u.email, u.display_name FROM oauth_links l JOIN users u ON u.id = l.user_id WHERE l.provider = 'google' AND l.subject = ?1").bind(g.sub).first<{ id: string; email: string; display_name: string }>();
    let user = linked ?? (await userByEmail(c.env, g.email));
    if (!user) user = await createUser(c.env, g.email, g.name);
    else await c.env.DB.prepare("UPDATE users SET email_verified = 1, updated_at = ?2 WHERE id = ?1").bind(user.id, now()).run();
    if (!linked) await c.env.DB.prepare("INSERT OR IGNORE INTO oauth_links (provider, subject, user_id) VALUES ('google', ?1, ?2)").bind(g.sub, user.id).run();
    return sessionResponse(c, await startSession(c.env, user.id, c.req.header("user-agent") ?? null), user);
  });

  app.post("/v1/auth/refresh", async (c) => {
    route(c, "POST /v1/auth/refresh");
    requireOrigin(c);
    const cookie = readRefreshCookie(c.req.header("cookie") ?? null);
    if (!cookie) throw unauthorized();
    await rateLimit(c.env.DB, `refresh:ip:${await hashId(c.env, clientIp(c))}`, 120, 3600);
    const issued = await rotateSession(c.env, cookie);
    const row = await c.env.DB.prepare("SELECT u.id, u.email, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.family_id = (SELECT family_id FROM sessions WHERE id = ?1)  AND s.revoked_at IS NULL LIMIT 1").bind(cookie.id).first<{ id: string; email: string; display_name: string }>();
    if (!row) throw unauthorized();
    return sessionResponse(c, issued, row);
  });

  // Sign-out revokes the session row (the whole refresh family).
  app.post("/v1/auth/signout", async (c) => {
    route(c, "POST /v1/auth/signout");
    requireOrigin(c);
    const cookie = readRefreshCookie(c.req.header("cookie") ?? null);
    const fam = cookie ? await familyOfCookie(c.env, cookie) : null;
    if (fam) await revokeFamily(c.env, fam);
    return new Response(null, { status: 204, headers: { "set-cookie": clearCookie() } });
  });

  app.post("/v1/auth/signout-all", async (c) => {
    route(c, "POST /v1/auth/signout-all");
    const u = await authenticate(c);
    await revokeAll(c.env, u.id);
    return new Response(null, { status: 204, headers: { "set-cookie": clearCookie() } });
  });
}
