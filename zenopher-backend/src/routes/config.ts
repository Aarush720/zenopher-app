import type { Hono } from "hono";
import { route, type AppEnv } from "../app";
import { settings } from "../env";
import { critiqueAvailable } from "./critique";

export function configRoutes(app: Hono<AppEnv>) {
  // Feature flags, limits and critique availability. Public, cached per session by the client.
  app.get("/v1/config", async (c) => {
    route(c, "GET /v1/config");
    const s = settings(c.env);
    return c.json(
      { features: { critique: await critiqueAvailable(c.env) }, limits: { max_asset_bytes: s.maxAssetBytes, max_version_bytes: s.maxVersionBytes, critique_daily_limit: s.critiqueDailyLimit, critique_max_image_px: s.maxCritiqueImagePx } },
      200, { "cache-control": "private, max-age=300" },
    );
  });
}
