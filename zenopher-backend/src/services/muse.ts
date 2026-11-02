import { outbound, type Env } from "../env";

export interface MuseReply { text: string; credits?: number }
export class MuseError extends Error { constructor(public kind: "timeout" | "failed", m: string) { super(m); } }

/**
 * Adapter for the Muse API. UNVERIFIED (spec 9.1): the request and response shapes below are an assumption.
 * Everything Muse-specific lives in this file, so confirming the real API means changing only `HttpMuse`.
 * Expected: POST MUSE_API_URL, Bearer key, JSON { model, prompt, image? (base64 PNG) }
 *           reply JSON { text, usage?: { credits } }  (also accepted: { output_text } or OpenAI-style choices)
 */
export interface MuseAdapter { review(input: { prompt: string; image: Uint8Array | null; timeoutMs: number }): Promise<MuseReply> }

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export class HttpMuse implements MuseAdapter {
  constructor(private env: Env) {}
  async review({ prompt, image, timeoutMs }: { prompt: string; image: Uint8Array | null; timeoutMs: number }): Promise<MuseReply> {
    const { MUSE_API_URL, MUSE_API_KEY, MUSE_MODEL } = this.env;
    if (!MUSE_API_URL || !MUSE_API_KEY) throw new MuseError("failed", "not configured");
    try {
      // The image goes in the request body and is never stored; it exists only in this request's memory.
      const res = await outbound(this.env)(MUSE_API_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${MUSE_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ model: MUSE_MODEL || undefined, prompt, ...(image ? { image: b64(image) } : {}) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new MuseError("failed", `status ${res.status}`);
      const j = (await res.json()) as Record<string, any>;
      const text = j.text ?? j.output_text ?? j.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new MuseError("failed", "unexpected reply shape");
      const credits = j.usage?.credits;
      return { text, credits: typeof credits === "number" ? credits : undefined };
    } catch (e) {
      if (e instanceof MuseError) throw e;
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) throw new MuseError("timeout", "timeout");
      throw new MuseError("failed", "network");
    }
  }
}
