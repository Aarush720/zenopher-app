export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  // Secrets (spec 8.7). Never in the repository, the build output, or the client bundle.
  ZPH_MASTER_KEY: string;
  MUSE_API_KEY?: string;
  EMAIL_API_KEY?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TURNSTILE_SECRET?: string;
  // Plain variables.
  APP_ORIGIN: string;
  ALLOWED_ORIGINS: string;
  EMAIL_API_URL?: string;
  EMAIL_FROM?: string;
  LOCAL_AUTH_ENABLED?: string;
  GOOGLE_CLIENT_ID?: string;
  TURNSTILE_REQUIRED?: string;
  CRITIQUE_ENABLED?: string;
  CRITIQUE_STARTING_CREDITS?: string;
  CRITIQUE_RESERVE_CREDITS?: string;
  CRITIQUE_COST_PER_REVIEW?: string;
  CRITIQUE_DAILY_LIMIT?: string;
  MUSE_API_URL?: string;
  MUSE_MODEL?: string;
  MUSE_ACCEPTS_IMAGES?: string;
  R2_HARD_LIMIT_BYTES?: string;
  R2_RESERVED_BYTES?: string;
  MAX_ASSET_BYTES?: string;
  MAX_VERSION_BYTES?: string;
  DELETION_GRACE_DAYS?: string;
  /** Tests only: replaces global fetch for calls to Muse, the email API, Turnstile and Google. */
  OUTBOUND_FETCH?: typeof fetch;
}

const num = (v: string | undefined, d: number) => { const n = Number(v); return v !== undefined && v !== "" && Number.isFinite(n) ? n : d; };

export function settings(env: Env) {
  return {
    appOrigin: env.APP_ORIGIN,
    allowedOrigins: env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    turnstileRequired: env.TURNSTILE_REQUIRED !== "false",
    critiqueEnabled: env.CRITIQUE_ENABLED !== "false",
    startingCredits: num(env.CRITIQUE_STARTING_CREDITS, 150),
    reserveCredits: num(env.CRITIQUE_RESERVE_CREDITS, 10),
    costPerReview: num(env.CRITIQUE_COST_PER_REVIEW, 1),
    critiqueDailyLimit: num(env.CRITIQUE_DAILY_LIMIT, 2),
    museAcceptsImages: env.MUSE_ACCEPTS_IMAGES !== "false",
    r2HardLimitBytes: num(env.R2_HARD_LIMIT_BYTES, 8 * 1024 * 1024 * 1024),
    r2ReservedBytes: num(env.R2_RESERVED_BYTES, 0),
    maxAssetBytes: num(env.MAX_ASSET_BYTES, 10 * 1024 * 1024),
    maxVersionBytes: num(env.MAX_VERSION_BYTES, 25 * 1024 * 1024),
    maxThumbnailBytes: 512 * 1024,
    maxCritiqueImageBytes: 4 * 1024 * 1024,
    maxCritiqueImagePx: 1024,
    deletionGraceDays: num(env.DELETION_GRACE_DAYS, 14),
    trashDays: 30,
    accessTtl: 15 * 60,
    refreshTtl: 30 * 24 * 3600,
    magicLinkTtl: 15 * 60,
    exportTtl: 7 * 24 * 3600,
    exportMaxBytes: 64 * 1024 * 1024,
  };
}
export type Settings = ReturnType<typeof settings>;

export const outbound = (env: Env): typeof fetch => env.OUTBOUND_FETCH ?? fetch;
