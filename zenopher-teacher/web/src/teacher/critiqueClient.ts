import { validateCritique } from "./critiquePrompt";
import type { CritiqueRequest, CritiqueResult, TeacherHost } from "./types";

export type CritiqueOutcome =
  | { ok: true; result: CritiqueResult; cached: boolean }
  | { ok: false; reason: "no_consent" | "unavailable" | "feature_disabled" | "rate_limited" | "timeout" | "cancelled" | "offline" | "too_large" };

/**
 * "Review my design". Only the user triggers it, and only after they opted in. The client renders the page as PNG at a
 * fixed maximum size and sends it with the findings summary. Output is plain text and never changes the design.
 */
export class CritiqueClient {
  private ctrl: AbortController | null = null;
  constructor(private host: TeacherHost, private api = "/v1", private fetchFn: typeof fetch = fetch.bind(globalThis),
              private opts = { maxImagePx: 1024, maxImageBytes: 4 * 1024 * 1024, timeoutMs: 35_000 }) {}

  /** The loading state's cancel button. */
  cancel(): void { this.ctrl?.abort("cancelled"); }

  async review(req: CritiqueRequest, consentGranted: boolean): Promise<CritiqueOutcome> {
    if (!consentGranted) return { ok: false, reason: "no_consent" };
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, reason: "offline" };
    this.ctrl = new AbortController();
    const timer = setTimeout(() => this.ctrl?.abort("timeout"), this.opts.timeoutMs);
    try {
      const png = await this.host.renderPagePng(this.opts.maxImagePx);
      if (png.size > this.opts.maxImageBytes) return { ok: false, reason: "too_large" };
      const form = new FormData();
      form.set("image", png, "page.png");
      form.set("meta", JSON.stringify(req));
      const res = await this.fetchFn(`${this.api}/critique`, { method: "POST", body: form, credentials: "include", signal: this.ctrl.signal });
      if (res.status === 429) return { ok: false, reason: "rate_limited" };
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        return { ok: false, reason: body.code === "feature_disabled" ? "feature_disabled" : "unavailable" };
      }
      const data = (await res.json()) as { text: string; cached?: boolean };
      // Validate again on the device: the reply is untrusted text.
      const result = validateCritique(data.text, req.findings.map((f) => f.rule));
      return result ? { ok: true, result, cached: !!data.cached } : { ok: false, reason: "unavailable" };
    } catch (e) {
      return { ok: false, reason: this.ctrl.signal.reason === "timeout" ? "timeout" : this.ctrl.signal.reason === "cancelled" ? "cancelled" : "unavailable" };
    } finally {
      clearTimeout(timer);
      this.ctrl = null;
    }
  }
}
