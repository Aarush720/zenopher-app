// Mirrors the JSON the Rust teacher produces. Keep in step with src/finding.rs, planner.rs, store.rs.
export type Level = "creative" | "corporate_base" | "corporate_full";
export type FindingClass = "base" | "pattern" | "professional";
export type Severity = "must" | "optional";
export type Unit = "ratio" | "px" | "share" | "fraction" | "count" | "dpi" | "mm";

export type Command =
  | { type: "set_text_color"; layer: number; color: { r: number; g: number; b: number; a: number } }
  | { type: "set_font_size"; layer: number; size_px: number }
  | { type: "set_leading"; layer: number; leading: number }
  | { type: "set_bounds"; layer: number; rect: { x: number; y: number; w: number; h: number } }
  | { type: "move_by"; layer: number; dx: number; dy: number };

export interface Finding {
  rule: string;
  class: FindingClass;
  severity: Severity;
  layers: number[];
  measured: { value: number; unit: Unit };
  expected: { kind: "at_least" | "at_most" | "exactly"; value: number } | { kind: "range"; lo: number; hi: number };
  score: number | null;
  measurement_confidence: number;
  fix: { safety: "safe" | "needs_input"; commands: Command[]; conflict_key: string } | null;
  unsure: boolean;
  extra: { centroid: [number, number] | null } | null;
}

export interface Display { explain_open: boolean; compact: boolean; demoted: boolean }
export interface FindingView { key: string; finding: Finding; message: string; explanation: string; display: Display }

export interface Diff { added: Finding[]; changed: Finding[]; resolved: string[]; badge: number; unavailable: string[] }
export interface FixBatch { keys: string[]; commands: Command[] }
export interface PlannedFix { key: string; rule: string; message: string; commands: Command[] }
export interface ApplyAllPlan { id: number; pass: number; max_passes: number; fixes: PlannedFix[]; skipped: { key: string; reason: string }[]; summary: string }

export interface LearningEvent { rule: string; class: FindingClass; outcome: "applied" | "dismissed" | "undone"; mode: Level; style_id: string | null; occurred_at: number }
export interface CritiqueRequest {
  page: { width_px: number; height_px: number; mode: Level; style_name: string | null };
  findings: { rule: string; class: FindingClass; severity: Severity; measured: string; expected: string }[];
}

export const CRITIQUE_AREAS = ["readability", "emphasis", "balance", "spacing"] as const;
export type CritiqueArea = (typeof CRITIQUE_AREAS)[number];
export interface CritiqueResult { summary: string; points: { area: CritiqueArea; agrees_with: string[]; comment: string }[] }

/** What the editor shell gives the teacher. The document core owns the document; the teacher never edits it. */
export interface TeacherHost {
  now(): number;
  /** Snapshot JSON from the engine, in stacking order. */
  snapshotJson(): string;
  /** Run commands as ONE undoable step. */
  runCommands(commands: Command[]): void;
  selectLayers(ids: number[]): void;
  /** Page rendered as PNG, longest side at most maxPx. */
  renderPagePng(maxPx: number): Promise<Blob>;
}

/** The surface of the wasm class in src/wasm.rs. */
export interface WasmTeacherLike {
  set_level(level: string): string;
  set_style_json(profile: string): void;
  clear_style(): void;
  on_change(ids: Uint32Array, page: boolean, now: number): void;
  gesture_start(): void;
  gesture_end(now: number): void;
  run(): void;
  pump(snapshot: string, now: number): string;
  findings(): string;
  badge(): number;
  explain(key: string): string;
  show(key: string): string;
  apply(key: string, now: number): string;
  apply_all(): string;
  commit_apply_all(plan: string, now: number): string;
  reset_apply_all(): void;
  dismiss(key: string, snapshot: string, now: number): string;
  note_undo(key: string, now: number): void;
  take_events(): string;
  export_stats(): string;
  import_stats(rows: string): void;
  critique_request(): string;
}
