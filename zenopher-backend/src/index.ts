import { createApp } from "./app";
import { runScheduled } from "./cron";
import type { Env } from "./env";
import { accountRoutes } from "./routes/account";
import { assetRoutes } from "./routes/assets";
import { authRoutes } from "./routes/auth";
import { catalogRoutes } from "./routes/catalog";
import { configRoutes } from "./routes/config";
import { consentRoutes } from "./routes/consent";
import { critiqueRoutes } from "./routes/critique";
import { designRoutes } from "./routes/designs";
import { photocraftRoutes } from "./routes/photocraft";
import { sharingRoutes } from "./routes/sharing";

export function buildApp() {
  const app = createApp();
  authRoutes(app);
  designRoutes(app);
  assetRoutes(app);
  sharingRoutes(app);
  catalogRoutes(app);
  consentRoutes(app);
  critiqueRoutes(app);
  accountRoutes(app);
  configRoutes(app);
  photocraftRoutes(app);
  return app;
}

const app = buildApp();

// One codebase, two entry points: fetch for requests, scheduled for cron.
export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => app.fetch(req, env, ctx),
  scheduled: (ev: ScheduledController, env: Env, ctx: ExecutionContext) => { ctx.waitUntil(runScheduled(ev.cron, env)); },
} satisfies ExportedHandler<Env>;
