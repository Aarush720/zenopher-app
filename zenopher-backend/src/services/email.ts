import { outbound, type Env } from "../env";

/** Sends the sign-in email through an HTTP email API (Resend-style JSON). Failures are logged without the address or link. */
export async function sendMagicLink(env: Env, to: string, link: string): Promise<boolean> {
  if (!env.EMAIL_API_URL || !env.EMAIL_API_KEY) return false;
  try {
    const res = await outbound(env)(env.EMAIL_API_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.EMAIL_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject: "Your Zenopher sign-in link",
        text: `Open this link to sign in to Zenopher. It works once and expires in 15 minutes.\n\n${link}\n\nIf you did not ask for this, you can ignore this email.`,
      }),
    });
    if (!res.ok) console.error(JSON.stringify({ level: "error", event: "email_failed", status: res.status }));
    return res.ok;
  } catch {
    console.error(JSON.stringify({ level: "error", event: "email_failed" }));
    return false;
  }
}
