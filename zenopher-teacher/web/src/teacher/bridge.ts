import { CatalogSync, type StyleUnavailable } from "./catalogSync";
import { EventRecorder } from "./eventRecorder";
import { idbGet, idbSet } from "./idb";
import type { ApplyAllPlan, CritiqueRequest, Diff, FindingView, FixBatch, Level, LearningEvent, TeacherHost, WasmTeacherLike } from "./types";

type Listener = (state: { findings: FindingView[]; badge: number; unavailable: string[] }) => void;

const PUMP_MS = 50;
const STATS_KEY = "teacher:stats";

/**
 * Typed wrapper over the wasm teacher. It owns the pump timer, persists hint statistics on the device, hands learning
 * events to the recorder, and runs fixes through the host as single undoable steps. It decides nothing about the design.
 */
export class TeacherBridge {
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<Listener>();
  private unavailable: string[] = [];
  private level: Level = "creative";

  constructor(private t: WasmTeacherLike, private host: TeacherHost, private recorder: EventRecorder, private catalog: CatalogSync) {}

  async start(): Promise<void> {
    const stats = await idbGet<string>(STATS_KEY);
    if (stats) this.t.import_stats(stats);
    this.timer = setInterval(() => this.tick(), PUMP_MS);
  }
  stop(): void { if (this.timer !== null) clearInterval(this.timer); this.timer = null; }

  subscribe(l: Listener): () => void { this.listeners.add(l); return () => this.listeners.delete(l); }
  findings(): FindingView[] { return JSON.parse(this.t.findings()) as FindingView[]; }
  badge(): number { return this.t.badge(); }

  private notify(): void {
    const state = { findings: this.findings(), badge: this.t.badge(), unavailable: this.unavailable };
    this.listeners.forEach((l) => l(state));
  }

  private tick(): void {
    if (this.level === "creative") return;
    const out = this.t.pump(this.host.snapshotJson(), this.host.now());
    if (!out) return;
    this.unavailable = (JSON.parse(out) as Diff).unavailable;
    this.notify();
  }

  // --- from the document core ---
  onChange(layerIds: number[], pageChanged = false): void { this.t.on_change(Uint32Array.from(layerIds), pageChanged, this.host.now()); }
  gestureStart(): void { this.t.gesture_start(); }
  gestureEnd(): void { this.t.gesture_end(this.host.now()); }

  // --- modes and styles ---
  setLevel(level: Level): void {
    this.level = level;
    this.t.set_level(level);
    this.t.reset_apply_all();
    this.notify();
  }

  /** Attaches a style: loads it from the cache or the catalog, then lets the engine validate it. Base checks keep running on failure. */
  async setStyle(ref: { id: string; version: number } | null): Promise<{ ok: true } | { ok: false; reason: StyleUnavailable }> {
    if (!ref) { this.t.clear_style(); this.notify(); return { ok: true }; }
    const p = await this.catalog.profile(ref.id, ref.version);
    if ("unavailable" in p) { this.t.clear_style(); this.notify(); return { ok: false, reason: p.unavailable }; }
    try { this.t.set_style_json(p.json); } catch { this.t.clear_style(); this.notify(); return { ok: false, reason: "needs_update" }; }
    this.notify();
    return { ok: true };
  }

  // --- acting ---
  private async persist(): Promise<void> {
    await idbSet(STATS_KEY, this.t.export_stats());
    await this.recorder.record(JSON.parse(this.t.take_events()) as LearningEvent[]);
  }

  async apply(key: string): Promise<void> {
    const batch = JSON.parse(this.t.apply(key, this.host.now())) as FixBatch;
    this.t.reset_apply_all();
    this.host.runCommands(batch.commands);
    this.lastApplied = batch.keys;
    await this.persist();
  }
  private lastApplied: string[] = [];

  /** Call when the user undoes: counts as "undone" if it happens within 60 seconds of the fix. */
  async onUndo(): Promise<void> {
    for (const k of this.lastApplied) this.t.note_undo(k, this.host.now());
    this.lastApplied = [];
    await this.persist();
  }

  /** Step one: the summary. Nothing changes yet. */
  planApplyAll(): ApplyAllPlan { return JSON.parse(this.t.apply_all()) as ApplyAllPlan; }
  /** Step two, after the user confirms the summary. */
  async commitApplyAll(plan: ApplyAllPlan): Promise<void> {
    const batch = JSON.parse(this.t.commit_apply_all(JSON.stringify(plan), this.host.now())) as FixBatch;
    this.host.runCommands(batch.commands);
    this.lastApplied = batch.keys;
    await this.persist();
  }

  async dismiss(key: string): Promise<void> {
    this.t.dismiss(key, this.host.snapshotJson(), this.host.now());
    await this.persist();
    this.notify();
  }
  explain(key: string): string { return this.t.explain(key); }
  show(key: string): void { this.host.selectLayers(JSON.parse(this.t.show(key)) as number[]); }
  critiqueRequest(): CritiqueRequest { return JSON.parse(this.t.critique_request()) as CritiqueRequest; }
}
