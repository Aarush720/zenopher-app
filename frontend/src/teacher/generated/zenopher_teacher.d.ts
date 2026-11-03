/* tslint:disable */
/* eslint-disable */

export class WasmTeacher {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Returns a fix batch JSON. The shell runs its commands as one undoable step.
     */
    apply(key: string, now_ms: number): string;
    apply_all(): string;
    badge(): number;
    clear_style(): void;
    commit_apply_all(plan_json: string, now_ms: number): string;
    critique_request(): string;
    dismiss(key: string, snapshot_json: string, now_ms: number): string;
    explain(key: string): string;
    export_stats(): string;
    findings(): string;
    gesture_end(now_ms: number): void;
    gesture_start(): void;
    import_stats(rows_json: string): void;
    constructor(config_json: string);
    note_undo(key: string, now_ms: number): void;
    on_change(layer_ids: Uint32Array | number[], page_changed: boolean, now_ms: number): void;
    /**
     * Call on a timer (about every 50 ms) or requestIdleCallback. Returns a diff JSON when a run finished, else "".
     */
    pump(snapshot_json: string, now_ms: number): string;
    reset_apply_all(): void;
    run(): void;
    /**
     * "creative" | "corporate_base" | "corporate_full". Returns a diff JSON when findings were cleared, else "".
     */
    set_level(level: string): string;
    /**
     * Validates and attaches a style profile. Throws with the reason key on failure.
     */
    set_style_json(profile_json: string): void;
    show(key: string): string;
    take_events(): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmteacher_free: (a: number, b: number) => void;
    readonly wasmteacher_apply: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wasmteacher_apply_all: (a: number) => [number, number, number, number];
    readonly wasmteacher_badge: (a: number) => number;
    readonly wasmteacher_clear_style: (a: number) => void;
    readonly wasmteacher_commit_apply_all: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wasmteacher_critique_request: (a: number) => [number, number, number, number];
    readonly wasmteacher_dismiss: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly wasmteacher_explain: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmteacher_export_stats: (a: number) => [number, number, number, number];
    readonly wasmteacher_findings: (a: number) => [number, number, number, number];
    readonly wasmteacher_gesture_end: (a: number, b: number) => void;
    readonly wasmteacher_gesture_start: (a: number) => void;
    readonly wasmteacher_import_stats: (a: number, b: number, c: number) => [number, number];
    readonly wasmteacher_new: (a: number, b: number) => [number, number, number];
    readonly wasmteacher_note_undo: (a: number, b: number, c: number, d: number) => void;
    readonly wasmteacher_on_change: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly wasmteacher_pump: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wasmteacher_reset_apply_all: (a: number) => void;
    readonly wasmteacher_run: (a: number) => void;
    readonly wasmteacher_set_level: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmteacher_set_style_json: (a: number, b: number, c: number) => [number, number];
    readonly wasmteacher_show: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmteacher_take_events: (a: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
