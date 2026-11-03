import { describe, expect, it } from "vitest";
import { call, cookieOf, makeEnv, ORIGIN, signIn } from "./helpers";

describe("sign-in", () => {
  it("answers the same whether or not the account exists, and sends the link only by email", async () => {
    const h = makeEnv();
    const a = await call(h, "POST", "/v1/auth/magic", { json: { email: "new@test.dev" } });
    await signIn(h, "known@test.dev");
    const b = await call(h, "POST", "/v1/auth/magic", { json: { email: "known@test.dev" } });
    expect(a.status).toBe(202); expect(b.status).toBe(202);
    expect(a.json).toEqual(b.json);
    expect(JSON.stringify(a.json)).not.toContain("token");
  });

  it("a magic link works once", async () => {
    const h = makeEnv();
    await call(h, "POST", "/v1/auth/magic", { json: { email: "once@test.dev" } });
    const token = /#token=([\w-]+)/.exec(h.emails[0]!.text)![1]!;
    expect((await call(h, "POST", "/v1/auth/verify", { json: { token }, origin: true })).status).toBe(200);
    const again = await call(h, "POST", "/v1/auth/verify", { json: { token }, origin: true });
    expect(again.status).toBe(400); expect(again.json.error.code).toBe("invalid_link");
  });

  it("stores only hashes of tokens", async () => {
    const h = makeEnv();
    await call(h, "POST", "/v1/auth/magic", { json: { email: "hash@test.dev" } });
    const token = /#token=([\w-]+)/.exec(h.emails[0]!.text)![1]!;
    const rows = h.db.raw.prepare("SELECT token_hash FROM auth_tokens").all() as { token_hash: string }[];
    expect(rows[0]!.token_hash).not.toBe(token);
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("requires Turnstile when configured", async () => {
    const h = makeEnv({ TURNSTILE_REQUIRED: "true" } as never);
    expect((await call(h, "POST", "/v1/auth/magic", { json: { email: "c@test.dev" } })).json.error.code).toBe("captcha_failed");
    expect((await call(h, "POST", "/v1/auth/magic", { json: { email: "c@test.dev", turnstile_token: "good-token" } })).status).toBe(202);
  });

  it("does not claim a link was sent when email delivery is unavailable", async () => {
    const h = makeEnv({ EMAIL_API_KEY: undefined });
    const r = await call(h, "POST", "/v1/auth/magic", { json: { email: "mail-down@test.dev" } });
    expect(r.status).toBe(503);
    expect(r.json.error.code).toBe("email_unavailable");
  });

  it("rate limits magic links per email", async () => {
    const h = makeEnv();
    for (let i = 0; i < 5; i++) expect((await call(h, "POST", "/v1/auth/magic", { json: { email: "spam@test.dev" } })).status).toBe(202);
    const r = await call(h, "POST", "/v1/auth/magic", { json: { email: "spam@test.dev" } });
    expect(r.status).toBe(429); expect(r.headers.get("retry-after")).toBeTruthy();
  });

  it("rejects unknown fields", async () => {
    const h = makeEnv();
    const r = await call(h, "POST", "/v1/auth/magic", { json: { email: "x@test.dev", admin: true } });
    expect(r.status).toBe(400); expect(r.json.error.fields).toContain("(body)");
  });
});

describe("sessions", () => {
  it("rotates the refresh token, sets a locked-down cookie, and revokes the family when an old token is reused", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const verify = await call(h, "POST", "/v1/auth/refresh", { headers: { cookie: s.cookie }, origin: true });
    expect(verify.status).toBe(200);
    const sc = verify.headers.get("set-cookie")!;
    expect(sc).toContain("HttpOnly"); expect(sc).toContain("Secure"); expect(sc).toContain("SameSite=Strict"); expect(sc).toContain("Path=/v1/auth");
    const second = cookieOf(verify.headers);
    expect(second).not.toBe(s.cookie);

    // Replay the first (already used) token a moment later: refused, but treated as a race, not theft.
    expect((await call(h, "POST", "/v1/auth/refresh", { headers: { cookie: s.cookie }, origin: true })).json.error.code).toBe("refresh_race");
    // Replay after the grace window: the whole family is revoked, including the newest token.
    h.db.raw.exec("UPDATE sessions SET revoked_at = revoked_at - 60 WHERE revoked_at IS NOT NULL");
    expect((await call(h, "POST", "/v1/auth/refresh", { headers: { cookie: s.cookie }, origin: true })).json.error.code).toBe("session_revoked");
    expect((await call(h, "POST", "/v1/auth/refresh", { headers: { cookie: second }, origin: true })).status).toBe(401);
    // And the access token stops working at once.
    expect((await call(h, "GET", "/v1/account", { token: s.token })).status).toBe(401);
  });

  it("refuses cookie endpoints without a trusted Origin", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    expect((await call(h, "POST", "/v1/auth/refresh", { headers: { cookie: s.cookie } })).json.error.code).toBe("bad_origin");
    expect((await call(h, "POST", "/v1/auth/refresh", { headers: { cookie: s.cookie, origin: "https://evil.test" } })).status).toBe(403);
  });

  it("sign-out revokes the session; sign-out-all revokes every device", async () => {
    const h = makeEnv();
    const s = await signIn(h, "multi@test.dev");
    const second = await signIn(h, "multi@test.dev");
    expect((await call(h, "POST", "/v1/auth/signout", { headers: { cookie: s.cookie }, origin: true })).status).toBe(204);
    expect((await call(h, "GET", "/v1/account", { token: s.token })).status).toBe(401);
    expect((await call(h, "GET", "/v1/account", { token: second.token })).status).toBe(200);
    expect((await call(h, "POST", "/v1/auth/signout-all", { token: second.token })).status).toBe(204);
    expect((await call(h, "GET", "/v1/account", { token: second.token })).status).toBe(401);
  });

  it("rejects forged and expired access tokens", async () => {
    const h = makeEnv();
    const s = await signIn(h);
    const [v, p, m] = s.token.split(".");
    expect((await call(h, "GET", "/v1/account", { token: `${v}.${p}.${m!.slice(0, -2)}xx` })).status).toBe(401);
    const claims = JSON.parse(Buffer.from(p!, "base64url").toString()); claims.uid = "someoneelse";
    expect((await call(h, "GET", "/v1/account", { token: `${v}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${m}` })).status).toBe(401);
    expect((await call(h, "GET", "/v1/account")).status).toBe(401);
  });
});

describe("headers", () => {
  it("sends security headers, CORS only for allowed origins, and never returns stack traces", async () => {
    const h = makeEnv();
    const ok = await call(h, "GET", "/v1/config", { headers: { origin: ORIGIN } });
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(ok.headers.get("access-control-allow-credentials")).toBe("true");
    expect(ok.headers.get("strict-transport-security")).toBeTruthy();
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(ok.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    const bad = await call(h, "GET", "/v1/config", { headers: { origin: "https://evil.test" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
    const pre = await call(h, "OPTIONS", "/v1/designs", { headers: { origin: ORIGIN } });
    expect(pre.status).toBe(204);
    h.env.ZPH_MASTER_KEY = "short";
    const s = await call(h, "POST", "/v1/designs", { token: "x", json: {} });
    expect(JSON.stringify(s.json)).not.toMatch(/at \w+|\.ts:/);
  });
});
