import { outbound, type Env } from "../env";

export interface MuseReply { text: string; credits?: number }
export class MuseError extends Error { constructor(public kind: "timeout" | "failed", m: string) { super(m); } }

/**
 * Adapter for the Muse API on api.meta.ai (OpenAI-compatible chat completions).
 * Endpoint: POST {MUSE_API_URL}/chat/completions, Bearer key,
 *   JSON { model, messages: [{ role: "user", content }] }.
 * SAM models (sam-3.1) are segmentation-only and refuse text prompts, so this
 * uses a Spark text model. Images: chat completions here rejected image_url
 * content parts in testing, so MUSE_ACCEPTS_IMAGES=false sends text-only.
 */
export interface MuseAdapter { review(input: { prompt: string; image: Uint8Array | null; timeoutMs: number }): Promise<MuseReply> }

export class HttpMuse implements MuseAdapter {
  constructor(private env: Env) {}
  async review({ prompt, image, timeoutMs }: { prompt: string; image: Uint8Array | null; timeoutMs: number }): Promise<MuseReply> {
    const { MUSE_API_URL, MUSE_API_KEY, MUSE_MODEL } = this.env;
    if (!MUSE_API_URL || !MUSE_API_KEY) throw new MuseError("failed", "not configured");
    // api.meta.ai speaks OpenAI-compatible chat completions at /v1/chat/completions.
    // Accept either the base (https://api.meta.ai/v1) or the full endpoint in env.
    const base = MUSE_API_URL.replace(/\/$/, "");
    const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
    try {
      // The prompt goes as a user message; no image part (rejected in testing). Text-only.
      void image;
      const res = await outbound(this.env)(url, {
        method: "POST",
        headers: { authorization: `Bearer ${MUSE_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ model: MUSE_MODEL || "muse-spark-1.3", messages: [{ role: "user", content: prompt }] }),
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
