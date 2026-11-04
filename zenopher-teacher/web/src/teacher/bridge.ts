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
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private paused = false;
  private lifecycle = 0;
  private snapshot: string | null = null;
  private styleRequest = 0;
  private listeners = new Set<Listener>();
  private unavailable: string[] = [];
  private level: Level = "creative";

  constructor(private t: WasmTeacherLike, private host: TeacherHost, private recorder: EventRecorder, private catalog: CatalogSync) {}

  async start(): Promise<void> {
    const lifecycle = ++this.lifecycle;
    this.running = true;
    const stats = await idbGet<string>(STATS_KEY);
    if (!this.running || lifecycle !== this.lifecycle) return;
    if (stats) this.t.import_stats(stats);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.visibilityChanged);
    this.schedule();
  }
  stop(): void {
    this.running = false;
    this.lifecycle++;
    this.styleRequest++;
    this.cancelTimer();
    this.snapshot = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.visibilityChanged);
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private visibilityChanged = (): void => { this.schedule(); };

  setPaused(paused: boolean): void { this.paused = paused; this.schedule(); }

  private schedule(minimumDelay = 0): void {
    this.cancelTimer();
    if (!this.running || this.paused || (typeof document !== "undefined" && document.hidden)) return;
    const delay = this.t.next_pump_delay(this.host.now());
    if (delay < 0) return;
    this.timer = setTimeout(() => this.tick(), Math.max(minimumDelay, Math.ceil(delay)));
  }

  subscribe(l: Listener): () => void { this.listeners.add(l); return () => this.listeners.delete(l); }
  findings(): FindingView[] { return JSON.parse(this.t.findings()) as FindingView[]; }
  badge(): number { return this.t.badge(); }

  private notify(): void {
    const state = { findings: this.findings(), badge: this.t.badge(), unavailable: this.unavailable };
    this.listeners.forEach((l) => l(state));
  }

  private tick(): void {
    this.timer = null;
    if (!this.running || this.level === "creative") return;
    try {
      const snap = this.snapshot ?? this.host.snapshotJson();
      if (!snap) return;
      this.snapshot = snap;
      const out = this.t.pump(snap, this.host.now());
      if (out) {
        this.unavailable = (JSON.parse(out) as Diff).unavailable;
        this.notify();
      }
    } catch {
      // A malformed snapshot is retried on the next edit, not in an infinite busy loop.
      this.snapshot = null;
      return;
    }
    this.schedule(PUMP_MS);
  }

  // --- from the document core ---
  onChange(layerIds: number[], pageChanged = false): void {
    this.snapshot = null;
    this.t.on_change(Uint32Array.from(layerIds), pageChanged, this.host.now());
    this.schedule();
  }
  gestureStart(): void { this.t.gesture_start(); this.cancelTimer(); }
  gestureEnd(): void { this.t.gesture_end(this.host.now()); this.schedule(); }

  // --- modes and styles ---
  setLevel(level: Level): void {
    this.level = level;
    this.t.set_level(level);
    if (level === "creative") this.unavailable = [];
    this.t.reset_apply_all();
    this.notify();
    this.snapshot = null;
    this.schedule();
  }

  /** Attaches a style: loads it from the cache or the catalog, then lets the engine validate it. Base checks keep running on failure. */
  async setStyle(ref: { id: string; version: number } | null): Promise<{ ok: true } | { ok: false; reason: StyleUnavailable }> {
    const request = ++this.styleRequest;
    if (!ref) { this.t.clear_style(); this.notify(); this.schedule(); return { ok: true }; }
    const p = await this.catalog.profile(ref.id, ref.version);
    if (request !== this.styleRequest) return { ok: false, reason: "not_downloaded" };
    if ("unavailable" in p) { this.t.clear_style(); this.notify(); this.schedule(); return { ok: false, reason: p.unavailable }; }
    try { this.t.set_style_json(p.json); } catch { this.t.clear_style(); this.notify(); this.schedule(); return { ok: false, reason: "needs_update" }; }
    this.notify();
    this.schedule();
    return { ok: true };
  }

  // --- acting ---
  private async persist(): Promise<void> {
    // Read WASM synchronously: the owner may free it while IndexedDB is pending.
    const stats = this.t.export_stats();
    const events = JSON.parse(this.t.take_events()) as LearningEvent[];
    await idbSet(STATS_KEY, stats);
    await this.recorder.record(events);
  }

  async apply(key: string): Promise<void> {
    const stats = this.t.export_stats();
    const batch = JSON.parse(this.t.apply(key, this.host.now())) as FixBatch;
    this.t.reset_apply_all();
    await this.executeBatch(batch, stats);
  }

  private async executeBatch(batch: FixBatch, previousStats: string): Promise<void> {
    const lifecycle = this.lifecycle;
    try {
      await this.host.runCommands(batch.commands);
      if (!this.running || lifecycle !== this.lifecycle) return;
      this.lastApplied = batch.keys;
      await this.persist();
    } catch (error) {
      if (this.running && lifecycle === this.lifecycle) {
        this.t.import_stats(previousStats);
        this.t.take_events();
        this.t.reset_apply_all();
        this.t.run();
      }
      throw error;
    } finally {
      if (this.running && lifecycle === this.lifecycle) {
        this.snapshot = null;
        this.schedule();
      }
    }
  }
  private lastApplied: string[] = [];

  /** Call when the user undoes: counts as "undone" if it happens within 60 seconds of the fix. */
  async onUndo(): Promise<void> {
    for (const k of this.lastApplied) this.t.note_undo(k, this.host.now());
    this.lastApplied = [];
    await this.persist();
  }

  /** Step one: the summary. Nothing changes yet. */
  planApplyAll(): ApplyAllPlan {
    return JSON.parse(this.t.apply_all()) as ApplyAllPlan;
  }
  /** Step two, after the user confirms the summary. */
  async commitApplyAll(plan: ApplyAllPlan): Promise<void> {
    const stats = this.t.export_stats();
    const batch = JSON.parse(this.t.commit_apply_all(JSON.stringify(plan), this.host.now())) as FixBatch;
    await this.executeBatch(batch, stats);
  }

  async dismiss(key: string): Promise<void> {
    try {
      this.t.dismiss(key, this.host.snapshotJson(), this.host.now());
    } catch {
      return; // already resolved: next tick reconciles
    }
    await this.persist();
    this.notify();
  }
  explain(key: string): string { return this.t.explain(key); }
  show(key: string): void { this.host.selectLayers(JSON.parse(this.t.show(key)) as number[]); }
  critiqueRequest(): CritiqueRequest { return JSON.parse(this.t.critique_request()) as CritiqueRequest; }
}
