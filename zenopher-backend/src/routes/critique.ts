import type { Hono } from "hono";
import { authenticate, mustBeActive, route, type AppEnv } from "../app";
import { hashId } from "../crypto";
import { rateCount, rateLimit } from "../db";
import { ApiError, badRequest } from "../errors";
import { settings, type Env } from "../env";
import { remaining, reserve, settle } from "../services/budget";
import { buildPrompt, critiqueMeta, validateCritique, type CritiqueMeta, type CritiqueResult } from "../services/critiquePrompt";
import { HttpMuse, MuseError, type MuseAdapter } from "../services/muse";
import { pngSize } from "../services/upload";
import { now, randomId, sha256Hex } from "../util";
import { hasConsent } from "./consent";

const CACHE_TTL = 24 * 3600;
const TIMEOUT_MS = 30_000;

/** Tests swap the adapter; production uses the HTTP one. */
export const museFor = (env: Env): MuseAdapter => (env as Env & { __muse?: MuseAdapter }).__muse ?? new HttpMuse(env);

const disabled = () => new ApiError(503, "feature_disabled", "Design review is not available right now.");

export async function critiqueAvailable(env: Env): Promise<boolean> {
  const s = settings(env);
  return s.critiqueEnabled && !!env.MUSE_API_URL && !!env.MUSE_API_KEY && (await remaining(env.DB)) >= s.costPerReview;
}

export function critiqueRoutes(app: Hono<AppEnv>) {
  app.post("/v1/critique", async (c) => {
    route(c, "POST /v1/critique");
    const s = settings(c.env);
    // 2. session, verified email, consent, daily limit, feature flag, then the image itself.
    const u = await authenticate(c); mustBeActive(u);
    if (!u.verified) throw new ApiError(403, "email_not_verified", "Verify your email to use design review.");
    if (!(await hasConsent(c.env.DB, u.id, "critique"))) throw new ApiError(403, "consent_required", "Design review needs your permission first.");
    if (!s.critiqueEnabled) throw disabled();
    const userHash = await hashId(c.env, u.id);
    const dayKey = `critique:day:${userHash}`;
    if ((await rateCount(c.env.DB, dayKey, 86400)) >= s.critiqueDailyLimit) throw new ApiError(429, "daily_limit", `You can request ${s.critiqueDailyLimit} reviews a day.`);
    await rateLimit(c.env.DB, `critique:min:${userHash}`, 6, 60); // blunt guard against hammering, cache hits included

    const declared = Number(c.req.header("content-length") ?? "0");
    if (!declared || declared > s.maxCritiqueImageBytes + 65536) throw new ApiError(413, "too_large", "The image is too large.");
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("image") as unknown, metaRaw = form?.get("meta") as unknown;
    if (!(file instanceof File) || typeof metaRaw !== "string") throw badRequest("bad_request", "Send an image and its details.");
    if (file.size > s.maxCritiqueImageBytes) throw new ApiError(413, "too_large", "The image is too large.");
    const image = new Uint8Array(await file.arrayBuffer());
    const dims = pngSize(image);
    if (!dims) throw badRequest("bad_image", "The image must be a PNG.");
    if (dims.w < 16 || dims.h < 16 || dims.w > s.maxCritiqueImagePx || dims.h > s.maxCritiqueImagePx) throw badRequest("bad_dimensions", `The image must be between 16 and ${s.maxCritiqueImagePx} pixels.`);
    let meta: CritiqueMeta;
    try { meta = critiqueMeta.parse(JSON.parse(metaRaw)); } catch { throw badRequest("bad_request", "The review details are not valid."); }
    const rules = meta.findings.map((f) => f.rule);

    // 3. A cache hit returns stored text and costs nothing.
    const imageHash = await sha256Hex(image);
    const hit = await c.env.DB.prepare("SELECT result_text FROM critique_cache WHERE image_hash = ?1 AND created_at > ?2").bind(imageHash, now() - CACHE_TTL).first<{ result_text: string }>();
    if (hit) return c.json({ text: hit.result_text, cached: true });

    // 4-6. Reserve, call, validate, settle. One retry with a stricter instruction, and the retry costs credits too.
    const muse = museFor(c.env);
    const sendImage = s.museAcceptsImages ? image : null;
    let result: CritiqueResult | null = null;
    let counted = false;
    for (const strict of [false, true]) {
      const requestId = randomId();
      if (!(await reserve(c.env.DB, requestId, userHash, s.costPerReview))) throw disabled();
      if (!counted) {
        counted = true;
        try { await rateLimit(c.env.DB, dayKey, s.critiqueDailyLimit, 86400); }
        catch (e) { await settle(c.env.DB, requestId, s.costPerReview, 0, "released"); throw e; }
      }
      try {
        const reply = await muse.review({ prompt: buildPrompt(meta, strict), image: sendImage, timeoutMs: TIMEOUT_MS });
        await settle(c.env.DB, requestId, s.costPerReview, reply.credits ?? s.costPerReview, "complete");
        result = validateCritique(reply.text, rules);
        if (result) break;
      } catch (e) {
        await settle(c.env.DB, requestId, s.costPerReview, 0, "released"); // failure or timeout: give the credits back
        if (e instanceof MuseError && e.kind === "timeout") throw new ApiError(504, "timeout", "The review took too long. Please try again.");
        throw new ApiError(502, "critique_unavailable", "The review is not available right now. Please try again.");
      }
    }
    if (!result) throw new ApiError(502, "critique_unavailable", "The review is not available right now. Please try again.");
    const text = JSON.stringify(result);
    await c.env.DB.prepare("INSERT OR REPLACE INTO critique_cache (image_hash, result_text, created_at) VALUES (?1,?2,?3)").bind(imageHash, text, now()).run();
    return c.json({ text, cached: false });
  });
}
