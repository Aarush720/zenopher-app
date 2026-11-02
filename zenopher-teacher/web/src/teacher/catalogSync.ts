import { idbGet, idbSet } from "./idb";

export interface CatalogEntry { id: string; version: number; name: string; summary: string; families: string[]; uses: string[]; thumb?: string }
export type StyleUnavailable = "not_downloaded" | "not_found" | "needs_update";

const INDEX_MAX_AGE_MS = 24 * 60 * 60 * 1000; // refreshed at most daily

/** Style index and profiles, cached in IndexedDB. Profiles are immutable by hash, so they are cached forever. */
export class CatalogSync {
  constructor(private api = "/v1", private fetchFn: typeof fetch = fetch.bind(globalThis)) {}

  /** Cached index, refreshed when older than a day. Offline, returns the cache with `stale: true`. */
  async index(): Promise<{ entries: CatalogEntry[]; stale: boolean }> {
    const cached = await idbGet<{ at: number; entries: CatalogEntry[] }>("catalog:index");
    if (cached && Date.now() - cached.at < INDEX_MAX_AGE_MS) return { entries: cached.entries, stale: false };
    try {
      const res = await this.fetchFn(`${this.api}/catalog/index`);
      if (!res.ok) throw new Error(String(res.status));
      const entries = ((await res.json()) as { styles: CatalogEntry[] }).styles;
      await idbSet("catalog:index", { at: Date.now(), entries });
      return { entries, stale: false };
    } catch {
      return { entries: cached?.entries ?? [], stale: true };
    }
  }

  /** Profile JSON text for the engine's style loader, which validates it. */
  async profile(id: string, version: number): Promise<{ json: string } | { unavailable: StyleUnavailable }> {
    const key = `catalog:style:${id}:${version}`;
    const cached = await idbGet<string>(key);
    if (cached) return { json: cached };
    try {
      const res = await this.fetchFn(`${this.api}/catalog/styles/${encodeURIComponent(id)}/${version}`);
      if (res.status === 404) return { unavailable: "not_found" };
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.text();
      await idbSet(key, json);
      return { json };
    } catch {
      return { unavailable: "not_downloaded" };
    }
  }
}
