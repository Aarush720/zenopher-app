import type { Design, Layer } from '../types';

const revisions = new WeakMap<Layer, number>();
let nextRevision = 1;

/** Layers are immutable. Object revisions avoid re-hashing embedded image bytes on every move. */
export function layerRevision(layer: Layer): number {
  let revision = revisions.get(layer);
  if (revision === undefined) { revision = nextRevision++; revisions.set(layer, revision); }
  return revision;
}

function sameLayer(left: Layer, right: Layer): boolean {
  if (left === right) return true;
  const keys = Object.keys(left) as Array<keyof Layer>;
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

/** Reuse unchanged layers received through postMessage so derived caches stay valid. */
export function mergeDesignUpdate(current: Design, updates: Partial<Design>, now = Date.now()): Design {
  let next = updates;
  if (updates.layers) {
    const previous = new Map(current.layers.map((layer) => [layer.id, layer]));
    const layers = updates.layers.map((layer) => {
      const old = previous.get(layer.id);
      // The editor does not own uploaded-asset metadata. Retain it while the
      // source image is unchanged so a transform does not upload it again.
      const incoming = old?.assetId && !layer.assetId && old.imageUrl === layer.imageUrl
        ? { ...layer, assetId: old.assetId } : layer;
      return old && sameLayer(old, incoming) ? old : incoming;
    });
    const unchanged = layers.length === current.layers.length && layers.every((layer, index) => layer === current.layers[index]);
    next = { ...updates, layers: unchanged ? current.layers : layers };
  }
  const changed = (Object.keys(next) as Array<keyof Design>)
    .some((key) => key !== 'updatedAt' && next[key] !== current[key]);
  return changed ? { ...current, ...next, updatedAt: Math.max(now, current.updatedAt + 1), syncStatus: 'local' } : current;
}

/** A completed network request must never overwrite edits made while it was in flight. */
export function mergeSyncResult(current: Design, sent: Design, synced: Design): Design {
  if (current === sent) return synced;
  const uploaded = new Map(synced.layers.map((layer) => [layer.id, layer]));
  return {
    ...current,
    remoteId: synced.remoteId,
    remoteVersion: synced.remoteVersion,
    syncStatus: 'local',
    layers: current.layers.map((layer) => {
      const asset = uploaded.get(layer.id);
      return !layer.assetId && asset?.assetId && asset.imageUrl === layer.imageUrl ? { ...layer, assetId: asset.assetId } : layer;
    }),
  };
}

export function createDesignPersistence(save: (design: Design) => Promise<void>, delay = 300) {
  const pending = new Map<string, { design: Design; since: number; timer: ReturnType<typeof setTimeout> }>();
  const flush = (id: string) => {
    const entry = pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(id);
    void save(entry.design).catch((error) => console.error('Could not save the design:', error));
  };
  return {
    schedule(design: Design) {
      const old = pending.get(design.id);
      if (old) clearTimeout(old.timer);
      const since = old?.since ?? Date.now();
      // Continuous editing must still reach disk periodically.
      const wait = Math.min(delay, Math.max(0, 2000 - (Date.now() - since)));
      pending.set(design.id, { design, since, timer: setTimeout(() => flush(design.id), wait) });
    },
    flush,
    flushAll() { for (const id of pending.keys()) flush(id); },
  };
}
