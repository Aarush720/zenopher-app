import { Design } from '../types';
import { api } from './api';

interface ZphPayload {
  app: 'Zenopher';
  version: '1.0.0';
  exportedAt: string;
  design: Design;
}

function makeRemoteId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function gzipDesign(design: Design): Promise<Uint8Array> {
  const payload: ZphPayload = {
    app: 'Zenopher',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    design,
  };
  const source = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const compressed = source.stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not restore an image asset.'));
    reader.onerror = () => reject(reader.error ?? new Error('Could not restore an image asset.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Pushes one local design as an encrypted backend version. The browser remains
 * the source of truth while offline; this helper only runs for an authenticated
 * session and returns the local design enriched with remote sync metadata.
 */
export async function syncDesign(design: Design): Promise<Design> {
  if (!api.authenticated) return design;

  const remoteId = design.remoteId ?? makeRemoteId();
  const localLayers = await Promise.all(design.layers.map(async (layer) => {
    if (layer.type !== 'image' || !layer.imageUrl || layer.assetId || !layer.imageUrl.startsWith('data:')) return layer;
    const asset = await dataUrlToBlob(layer.imageUrl);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(asset.type)) return layer;
    const uploaded = await api.uploadAsset(asset);
    return { ...layer, assetId: uploaded.id };
  }));
  const localDesign = { ...design, layers: localLayers };
  const remoteDesign: Design = {
    ...localDesign,
    layers: localLayers.map((layer) => layer.assetId ? { ...layer, imageUrl: undefined } : layer),
  };
  if (!design.remoteId) {
    await api.createDesign({
      id: remoteId,
      title: design.title,
      mode: design.mode,
      styleId: undefined,
      width: design.width,
      height: design.height,
    });
  } else {
    await api.updateDesign(remoteId, {
      title: design.title,
      mode: design.mode,
      styleId: undefined,
    });
  }

  const body = await gzipDesign(remoteDesign);
  const contentHash = await sha256Hex(body);
  const saved = await api.saveDesignVersion(
    remoteId,
    body,
    design.remoteVersion ?? 0,
    contentHash,
    `${remoteId}:${design.updatedAt}`,
  );

  return {
    ...localDesign,
    remoteId,
    remoteVersion: saved.version,
    syncStatus: 'synced',
  };
}

export async function decodeDesignDocument(blob: Blob): Promise<Design> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
  const payload = JSON.parse(await new Response(stream).text()) as Partial<ZphPayload>;
  if (payload.app !== 'Zenopher' || !payload.design || typeof payload.design !== 'object') {
    throw new Error('The remote design document is not a valid Zenopher project.');
  }
  return payload.design as Design;
}

export async function hydrateDesignAssets(design: Design, shareToken?: string): Promise<Design> {
  const layers = await Promise.all(design.layers.map(async (layer) => {
    if (layer.type !== 'image' || !layer.assetId || layer.imageUrl) return layer;
    const asset = await api.getAsset(layer.assetId, shareToken);
    return { ...layer, imageUrl: await blobToDataUrl(asset) };
  }));
  return { ...design, layers };
}

/** Pulls remote versions that are newer than the local copy during app startup. */
export async function pullRemoteDesigns(localDesigns: readonly Design[] = []): Promise<Design[]> {
  if (!api.authenticated) return [];
  const [active, trashed] = await Promise.all([api.listDesigns(), api.listDesigns(true)]);
  const metas = [...new Map([...active.designs, ...trashed.designs].map((meta) => [meta.id, meta])).values()];
  const localByRemoteId = new Map(localDesigns.filter((design) => design.remoteId).map((design) => [design.remoteId, design]));
  const pulled: Design[] = [];
  const pending = metas.filter((meta) => meta.current_version >= 1 && (localByRemoteId.get(meta.id)?.remoteVersion ?? 0) < meta.current_version);
  let next = 0;
  // Bounded concurrency avoids both a serial startup waterfall and a burst of
  // hundreds of simultaneous downloads/decompressions for a large library.
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
    while (next < pending.length) {
      const meta = pending[next++]!;
      const document = await api.getDesignContent(meta.id, meta.current_version);
      const design = await hydrateDesignAssets(await decodeDesignDocument(document));
      pulled.push({
        ...design,
        remoteId: meta.id,
        remoteVersion: meta.current_version,
        isDeleted: Boolean(meta.trashed_at),
        deletedAt: meta.trashed_at ?? undefined,
        updatedAt: Math.max(design.updatedAt, meta.updated_at * 1000),
        syncStatus: 'synced',
      });
    }
  }));
  return pulled;
}
