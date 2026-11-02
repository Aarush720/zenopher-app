import { outbound, type Env } from "../env";
import { fromB64url, now } from "../util";

export interface GoogleProfile { sub: string; email: string; name: string }

/**
 * Authorization-code exchange. The id_token arrives straight from Google's token endpoint over TLS, so its signature
 * is not re-verified here; issuer, audience, expiry and email verification are.
 */
export async function exchangeGoogleCode(env: Env, code: string, verifier: string, redirectUri: string): Promise<GoogleProfile | null> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  if (!redirectUri.startsWith(env.APP_ORIGIN)) return null;
  try {
    const res = await outbound(env)("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
    });
    if (!res.ok) return null;
    const idToken = ((await res.json()) as { id_token?: string }).id_token;
    const part = idToken?.split(".")[1];
    if (!part) return null;
    const c = JSON.parse(new TextDecoder().decode(fromB64url(part))) as Record<string, unknown>;
    const okIss = c.iss === "https://accounts.google.com" || c.iss === "accounts.google.com";
    if (!okIss || c.aud !== env.GOOGLE_CLIENT_ID || typeof c.exp !== "number" || c.exp <= now()) return null;
    if (c.email_verified !== true || typeof c.email !== "string" || typeof c.sub !== "string") return null;
    return { sub: c.sub, email: c.email.toLowerCase(), name: typeof c.name === "string" ? c.name.slice(0, 100) : c.email.split("@")[0]! };
  } catch { return null; }
}
