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
  private consentSet = false;
  private lifecycle = 0;
  private consentVersion = 0;
  private flushing: Promise<void> | null = null;
  private online = () => { void this.flush(); };

  constructor(private api = "/v1", private fetchFn: typeof fetch = fetch.bind(globalThis)) {}

  async start(consent: boolean): Promise<void> {
    const lifecycle = ++this.lifecycle;
    await this.setConsent(consent);
    if (lifecycle !== this.lifecycle) return;
    if (this.timer === null) this.timer = setInterval(() => void this.flush(), FLUSH_MS);
    if (typeof window !== "undefined") window.addEventListener("online", this.online);
  }

  stop(): void {
    this.lifecycle++;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (typeof window !== "undefined") window.removeEventListener("online", this.online);
  }

  async setConsent(granted: boolean): Promise<void> {
    if (this.consentSet && granted === this.consent) return;
    this.consentSet = true;
    const version = ++this.consentVersion;
    this.consent = granted;
    if (granted) {
      const stored = (await idbGet<LearningEvent[]>(QUEUE_KEY)) ?? [];
      if (version === this.consentVersion) this.queue = [...stored, ...this.queue].slice(-MAX_QUEUE);
    }
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
    if (this.flushing) return this.flushing;
    if (!this.consent || this.queue.length === 0) return;
    this.flushing = this.flushBatch().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private async flushBatch(): Promise<void> {
    const version = this.consentVersion;
    const batch = this.queue.slice(0, FLUSH_COUNT);
    try {
      const res = await this.fetchFn(`${this.api}/learning/events`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
        body: JSON.stringify({ events: batch }),
      });
      if (!res.ok || version !== this.consentVersion) return;
      this.queue.splice(0, batch.length);
      await idbSet(QUEUE_KEY, this.queue);
      if (this.queue.length >= FLUSH_COUNT) await this.flushBatch();
    } catch { /* offline: keep the queue */ }
  }
}
