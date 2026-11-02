import type { Env } from "../env";
import { dailyTasks, frequentTasks, weeklyTasks } from "./tasks";

/** The cron expressions in wrangler.toml pick the task group. Each task is isolated so one failure does not stop the rest. */
export async function runScheduled(cron: string, env: Env): Promise<void> {
  const groups: Record<string, [string, () => Promise<unknown>][]> = {
    "*/10 * * * *": frequentTasks(env),
    "15 3 * * *": dailyTasks(env),
    "45 3 * * 1": weeklyTasks(env),
  };
  for (const [name, run] of groups[cron] ?? []) {
    try { await run(); }
    catch (e) { console.error(JSON.stringify({ level: "error", event: "cron_task_failed", task: name, error: e instanceof Error ? e.name : "unknown" })); }
  }
}
