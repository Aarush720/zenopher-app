import { useState } from "react";
import type { TeacherBridge } from "./bridge";
import type { CritiqueClient, CritiqueOutcome } from "./critiqueClient";
import type { ApplyAllPlan, FindingView, Level } from "./types";
import { useTeacher } from "./useTeacher";

interface Props {
  bridge: TeacherBridge;
  level: Level;
  /** Null when no style is attached, or when it could not be loaded; the panel then explains why. */
  styleName: string | null;
  styleMessage?: string | null;
  critique: CritiqueClient;
  critiqueConsent: boolean;
  critiqueAvailable: boolean;
}

const CRITIQUE_MESSAGES: Record<string, string> = {
  no_consent: "Turn on design review in Privacy to use it.",
  unavailable: "The review is not available right now. Try again in a moment.",
  feature_disabled: "Design review is switched off for now.",
  rate_limited: "You have reached today's review limit.",
  timeout: "The review took too long. Try again.",
  cancelled: "Review cancelled.",
  offline: "Design review needs a connection.",
  too_large: "This page is too large to send for review.",
};

function Row({ v, bridge }: { v: FindingView; bridge: TeacherBridge }) {
  const [open, setOpen] = useState(v.display.explain_open);
  const [error, setError] = useState<string | null>(null);
  const apply = async () => { try { setError(null); await bridge.apply(v.key); } catch (reason) { setError(String(reason)); } };
  const canFix = v.finding.fix?.safety === "safe";
  return (
    <li className={`rounded-md border p-2 text-sm ${v.display.demoted ? "opacity-60" : ""}`}>
      <p>{v.message}</p>
      {error && <p role="alert">{error}</p>}
      {open && <p className="mt-1 text-xs text-neutral-600">{v.explanation}</p>}
      <div className="mt-2 flex gap-2 text-xs">
        <button aria-label="Why" aria-expanded={open} onClick={() => setOpen(!open)}>ⓘ</button>
        {v.finding.layers.length > 0 && <button onClick={() => bridge.show(v.key)}>Show</button>}
        {canFix && <button className="font-medium" onClick={() => void apply()}>{v.display.compact ? "Fix" : "Apply fix"}</button>}
        <button onClick={() => void bridge.dismiss(v.key)}>Dismiss</button>
      </div>
    </li>
  );
}

export function TeacherPanel({ bridge, level, styleName, styleMessage, critique, critiqueConsent, critiqueAvailable }: Props) {
  const { must, optional, badge, unavailable } = useTeacher(bridge);
  const [plan, setPlan] = useState<ApplyAllPlan | null>(null);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const [review, setReview] = useState<CritiqueOutcome | "loading" | null>(null);

  if (level === "creative") return null; // Creative works quietly: no panel, no checks.

  const startApplyAll = () => {
    try {
      const p = bridge.planApplyAll();
      if (p.fixes.length === 0) { setPlanNote(p.summary); return; }
      setPlanNote(null);
      setPlan(p);
    } catch (e) { setPlanNote(String(e)); }
  };
  const confirm = async () => {
    if (!plan) return;
    try { await bridge.commitApplyAll(plan); } catch (e) { setPlanNote(String(e)); }
    setPlan(null);
  };
  const runReview = async () => {
    setReview("loading");
    setReview(await critique.review(bridge.critiqueRequest(), critiqueConsent));
  };

  return (
    <aside className="flex w-80 flex-col gap-3 p-3" aria-label="Teacher">
      <header className="flex items-center justify-between">
        <h2 className="font-semibold">Checks</h2>
        <span className="rounded-full bg-neutral-900 px-2 text-xs text-white" aria-label={`${badge} things to change`}>{badge}</span>
      </header>

      {styleName === null && <p className="text-xs text-neutral-600">{styleMessage ?? "No style selected. Pick one to see how your design compares. The basic checks still run."}</p>}
      {unavailable.length > 0 && <p className="text-xs text-neutral-600">Some checks could not run on this page: {unavailable.join(", ")}.</p>}

      <section>
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide">Must change</h3>
          <button className="text-xs font-medium disabled:opacity-40" disabled={must.every((m) => m.finding.fix?.safety !== "safe")} onClick={startApplyAll}>Apply all</button>
        </div>
        {must.length === 0 ? <p className="text-xs text-neutral-600">Nothing needs to change.</p> : <ul className="flex flex-col gap-2">{must.map((v) => <Row key={v.key} v={v} bridge={bridge} />)}</ul>}
        {planNote && <p className="mt-1 text-xs text-neutral-600">{planNote}</p>}
      </section>

      {optional.length > 0 && (
        <section>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide">Optional</h3>
          <ul className="flex flex-col gap-2">{optional.map((v) => <Row key={v.key} v={v} bridge={bridge} />)}</ul>
        </section>
      )}

      {critiqueAvailable && critiqueConsent && (
        <section>
          <button className="text-sm font-medium" onClick={() => void runReview()} disabled={review === "loading"}>Review my design</button>
          {review === "loading" && <p className="mt-1 text-xs">Reviewing… <button onClick={() => critique.cancel()}>Cancel</button></p>}
          {review && review !== "loading" && !review.ok && <p className="mt-1 text-xs">{CRITIQUE_MESSAGES[review.reason]}</p>}
          {review && review !== "loading" && review.ok && (
            // Plain text only. The reply never changes the design.
            <div className="mt-2 text-sm">
              <p>{review.result.summary}</p>
              <ul className="mt-1 list-disc pl-4">{review.result.points.map((p, i) => <li key={i}><span className="font-medium">{p.area}:</span> {p.comment}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {plan && (
        <div role="dialog" aria-modal="true" aria-label="Apply all fixes" className="rounded-md border bg-white p-3 text-sm shadow">
          <p className="font-medium">{plan.summary}</p>
          <ul className="my-2 list-disc pl-4 text-xs">{plan.fixes.map((f) => <li key={f.key}>{f.message}</li>)}</ul>
          {plan.skipped.length > 0 && <p className="text-xs text-neutral-600">{plan.skipped.length} more will be offered after this step.</p>}
          <div className="mt-2 flex gap-2"><button className="font-medium" onClick={() => void confirm()}>Apply</button><button onClick={() => setPlan(null)}>Cancel</button></div>
        </div>
      )}
    </aside>
  );
}
