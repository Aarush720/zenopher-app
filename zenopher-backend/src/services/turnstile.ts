import { outbound, type Env } from "../env";

export async function verifyTurnstile(env: Env, token: string | undefined, ip: string | null): Promise<boolean> {
  if (!token || !env.TURNSTILE_SECRET) return false;
  try {
    const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await outbound(env)("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    return res.ok && ((await res.json()) as { success?: boolean }).success === true;
  } catch { return false; }
}
