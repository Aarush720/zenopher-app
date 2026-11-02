import { idbGet, idbSet } from "./idb";
import type { LearningEvent } from "./types";

const FLUSH_MS = 60_000;
const FLUSH_COUNT = 50;
const QUEUE_KEY = "learning:queue";
const MAX_QUEUE = 1000;

/**
 * Outcomes only: rule, class, outcome, mode, style id, time. The engine never gives this class layer ids or content.
 * Nothing is queued or sent unless learning consent is granted, and withdrawing consent deletes the queue.
 */
export class EventRecorder {
  private queue: LearningEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private consent = false;

  constructor(private api = "/v1", private fetchFn: typeof fetch = fetch.bind(globalThis)) {}

  async start(consent: boolean): Promise<void> {
    await this.setConsent(consent);
    if (this.timer === null) this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    if (typeof window !== "undefined") window.addEventListener("online", () => void this.flush());
  }

  stop(): void { if (this.timer !== null) clearInterval(this.timer); this.timer = null; }

  async setConsent(granted: boolean): Promise<void> {
    this.consent = granted;
    if (granted) this.queue = (await idbGet<LearningEvent[]>(QUEUE_KEY)) ?? [];
    else { this.queue = []; await idbSet(QUEUE_KEY, []); }
  }

  async record(events: LearningEvent[]): Promise<void> {
    if (!this.consent || events.length === 0) return;
    this.queue.push(...events);
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    await idbSet(QUEUE_KEY, this.queue);
    if (this.queue.length >= FLUSH_COUNT) await this.flush();
  }

  /** Sends the oldest batch. On failure (offline) the events stay queued and go out on reconnect. */
  async flush(): Promise<void> {
    if (!this.consent || this.queue.length === 0) return;
    const batch = this.queue.slice(0, FLUSH_COUNT);
    try {
      const res = await this.fetchFn(`${this.api}/learning/events`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
        body: JSON.stringify({ events: batch }),
      });
      if (!res.ok) return;
      this.queue.splice(0, batch.length);
      await idbSet(QUEUE_KEY, this.queue);
      if (this.queue.length >= FLUSH_COUNT) await this.flush();
    } catch { /* offline: keep the queue */ }
  }
}
