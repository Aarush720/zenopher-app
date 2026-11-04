import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { api } from '../../frontend/src/services/api';
import { pullRemoteDesigns } from '../../frontend/src/services/sync';
import type { ApiDesignMeta } from '../../frontend/src/services/api';
import type { Design } from '../../frontend/src/types';

vi.mock('../../frontend/src/services/api', () => ({ api: {
  authenticated: true, listDesigns: vi.fn(), getDesignContent: vi.fn(), getAsset: vi.fn(),
} }));

const document = (id: string): Design => ({
  id, title: 'Poster', layers: [], width: 1080, height: 1080, unit: 'px', mode: 'creative',
  createdAt: 0, updatedAt: 1, isSaved: true, background: '#000000',
});
const meta = (id: string): ApiDesignMeta => ({
  id, title: 'Poster', mode: 'creative', current_version: 2, style_id: null,
  width_px: 1080, height_px: 1080, created_at: 0, updated_at: 10, trashed_at: null,
});
const blob = (id: string) => new Blob([new Uint8Array(gzipSync(JSON.stringify({ app: 'Zenopher', version: '1.0.0', design: document(id) })))]);

beforeEach(() => { vi.clearAllMocks(); });

describe('library startup sync', () => {
  it('does not download or decompress documents already present at the remote version', async () => {
    vi.mocked(api.listDesigns).mockResolvedValue({ designs: [meta('remote')] });
    const pulled = await pullRemoteDesigns([{ ...document('poster'), remoteId: 'remote', remoteVersion: 2 }]);
    expect(pulled).toEqual([]);
    expect(api.getDesignContent).not.toHaveBeenCalled();
  });

  it('deduplicates metadata and converts server timestamps into browser milliseconds', async () => {
    vi.mocked(api.listDesigns).mockResolvedValue({ designs: [meta('remote'), meta('remote')] });
    vi.mocked(api.getDesignContent).mockResolvedValue(blob('poster'));
    const pulled = await pullRemoteDesigns();
    expect(api.getDesignContent).toHaveBeenCalledTimes(1);
    expect(pulled[0]!.updatedAt).toBe(10_000);
  });

  it('downloads new documents concurrently with at most three active downloads', async () => {
    const metas = Array.from({ length: 9 }, (_, index) => meta(String(index)));
    vi.mocked(api.listDesigns).mockImplementation(async (trashed) => ({ designs: trashed ? [] : metas }));
    let active = 0;
    let peak = 0;
    vi.mocked(api.getDesignContent).mockImplementation(async (id) => {
      active++;
      peak = Math.max(active, peak);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active--;
      return blob(id);
    });
    const pulled = await pullRemoteDesigns();
    expect(peak).toBe(3);
    expect(pulled).toHaveLength(9);
  });
});
