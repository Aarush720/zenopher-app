// Test doubles for D1 (over node:sqlite) and R2 (in memory). They follow the Cloudflare API shapes the Worker uses.
import { createRequire } from "node:module";
// Vite does not know node:sqlite as a builtin, so load it through require.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = import("node:sqlite").DatabaseSync;
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

type P = string | number | bigint | null | Uint8Array;
const norm = (v: unknown): P => (v instanceof ArrayBuffer ? new Uint8Array(v) : (v as P));

class Stmt {
  constructor(private db: DatabaseSync, readonly sql: string, readonly params: P[] = []) {}
  bind(...p: unknown[]) { return new Stmt(this.db, this.sql, p.map(norm)); }
  private exec<T>(f: (s: ReturnType<DatabaseSync["prepare"]>) => T): T { return f(this.db.prepare(this.sql)); }
  async run() { const r = this.exec((s) => s.run(...this.params)); return { success: true, results: [], meta: { changes: Number(r.changes) } }; }
  async first<T = unknown>() { return (this.exec((s) => s.get(...this.params)) ?? null) as T | null; }
  async all<T = unknown>() { const rows = this.exec((s) => s.all(...this.params)) as T[]; return { success: true, results: rows, meta: { changes: 0 } }; }
  _run() { return this.exec((s) => s.run(...this.params)); }
}

export class D1Shim {
  readonly raw = new DatabaseSync(":memory:");
  constructor() {
    this.raw.exec("PRAGMA foreign_keys = ON");
    const dir = join(import.meta.dirname, "..", "migrations");
    for (const f of readdirSync(dir).sort()) this.raw.exec(readFileSync(join(dir, f), "utf8"));
  }
  prepare(sql: string) { return new Stmt(this.raw, sql); }
  /** Atomic, like D1: all statements or none. */
  async batch(stmts: Stmt[]) {
    this.raw.exec("BEGIN");
    try {
      const out = stmts.map((s) => ({ success: true, results: [], meta: { changes: Number(s._run().changes) } }));
      this.raw.exec("COMMIT");
      return out;
    } catch (e) { this.raw.exec("ROLLBACK"); throw e; }
  }
}

interface Obj { data: Uint8Array; uploaded: Date; contentType?: string }
export class R2Shim {
  readonly store = new Map<string, Obj>();
  async put(key: string, value: Uint8Array | ArrayBuffer | string, opts?: { httpMetadata?: { contentType?: string } }) {
    const data = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value instanceof Uint8Array ? value : value);
    this.store.set(key, { data: data.slice(), uploaded: new Date(), contentType: opts?.httpMetadata?.contentType });
  }
  async get(key: string) {
    const o = this.store.get(key);
    if (!o) return null;
    return { key, body: new Response(o.data).body, arrayBuffer: async () => o.data.slice().buffer, httpEtag: `"${key.length}-${o.data.length}"`, httpMetadata: { contentType: o.contentType } };
  }
  async delete(keys: string | string[]) { for (const k of Array.isArray(keys) ? keys : [keys]) this.store.delete(k); }
  async list(o: { prefix?: string; cursor?: string; limit?: number } = {}) {
    const all = [...this.store.keys()].filter((k) => k.startsWith(o.prefix ?? "")).sort();
    const start = o.cursor ? all.findIndex((k) => k > o.cursor!) : 0;
    const slice = start < 0 ? [] : all.slice(start, start + (o.limit ?? 1000));
    const truncated = start >= 0 && start + slice.length < all.length;
    return { objects: slice.map((k) => ({ key: k, size: this.store.get(k)!.data.length, uploaded: this.store.get(k)!.uploaded })), truncated, cursor: truncated ? slice[slice.length - 1] : undefined };
  }
  /** Test helper: pretend an object is older than it is. */
  age(key: string, hours: number) { this.store.get(key)!.uploaded = new Date(Date.now() - hours * 3600_000); }
}
