import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherBridge } from '../../zenopher-teacher/web/src/teacher/bridge';
import { EventRecorder } from '../../zenopher-teacher/web/src/teacher/eventRecorder';
import { idbGet } from '../../zenopher-teacher/web/src/teacher/idb';
import type { WasmTeacherLike, TeacherHost, LearningEvent } from '../../zenopher-teacher/web/src/teacher/types';
import type { CatalogSync } from '../../zenopher-teacher/web/src/teacher/catalogSync';
import { createDesignPersistence, layerRevision, mergeDesignUpdate, mergeSyncResult } from '../../frontend/src/services/designState';
import type { Design } from '../../frontend/src/types';

vi.mock('../../zenopher-teacher/web/src/teacher/idb', () => ({
  idbGet: vi.fn(async () => undefined), idbSet: vi.fn(async () => {}),
}));

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); vi.mocked(idbGet).mockResolvedValue(undefined); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

function harness() {
  let due: number | null = null;
  let gesturing = false;
  let slices = 3;
  const teacher = {
    import_stats: vi.fn(), findings: () => '[]', badge: () => 0,
    next_pump_delay: () => due === null || gesturing ? -1 : Math.max(0, due - Date.now()),
    set_level: () => { due = 0; }, reset_apply_all: vi.fn(),
    clear_style: () => { due = 0; },
    on_change: () => { due = Date.now() + 400; slices = 3; },
    gesture_start: () => { gesturing = true; },
    gesture_end: () => { gesturing = false; if (due !== null) due = Date.now() + 400; },
    pump: vi.fn(() => { if (--slices === 0) due = null; return ''; }),
  } as unknown as WasmTeacherLike;
  const host = { now: () => Date.now(), snapshotJson: vi.fn(() => '{"layers":[]}') } as unknown as TeacherHost;
  const bridge = new TeacherBridge(teacher, host, {} as EventRecorder, {} as CatalogSync);
  return { teacher, host, bridge };
}

describe('teacher scheduling', () => {
  it('builds one snapshot per run and stops waking even when the completed run has no diff', async () => {
    const { bridge, teacher, host } = harness();
    await bridge.start();
    bridge.setLevel('corporate_base');
    await vi.advanceTimersByTimeAsync(1000);
    expect(teacher.pump).toHaveBeenCalledTimes(3);
    expect(host.snapshotJson).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(teacher.pump).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    bridge.stop();
  });

  it('waits for the end of a gesture and coalesces edits into one review', async () => {
    const { bridge, teacher, host } = harness();
    await bridge.start();
    bridge.setLevel('corporate_base');
    bridge.gestureStart();
    bridge.onChange([1]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(teacher.pump).not.toHaveBeenCalled();
    bridge.gestureEnd();
    await vi.advanceTimersByTimeAsync(399);
    expect(teacher.pump).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(501);
    expect(teacher.pump).toHaveBeenCalledTimes(3);
    expect(host.snapshotJson).toHaveBeenCalledTimes(1);
    bridge.stop();
  });

  it('does not revive a stopped bridge after its asynchronous start completes', async () => {
    let resolve!: (value: undefined) => void;
    vi.mocked(idbGet).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const { bridge, teacher } = harness();
    const starting = bridge.start();
    bridge.setLevel('corporate_base');
    bridge.stop();
    resolve(undefined);
    await starting;
    await vi.advanceTimersByTimeAsync(1000);
    expect(teacher.pump).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('suspends reviews while the page is hidden and resumes pending work on return', async () => {
    const page = Object.assign(new EventTarget(), { hidden: true });
    vi.stubGlobal('document', page);
    const { bridge, teacher } = harness();
    await bridge.start();
    bridge.setLevel('corporate_base');
    await vi.advanceTimersByTimeAsync(1000);
    expect(teacher.pump).not.toHaveBeenCalled();
    page.hidden = false;
    page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(teacher.pump).toHaveBeenCalledTimes(3);
    bridge.stop();
  });

  it('preserves queued work when a worker is paused and resumed', async () => {
    const { bridge, teacher } = harness();
    await bridge.start();
    bridge.setLevel('corporate_base');
    bridge.setPaused(true);
    bridge.onChange([1]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(teacher.pump).not.toHaveBeenCalled();
    bridge.setPaused(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(teacher.pump).toHaveBeenCalledTimes(3);
    bridge.stop();
  });
});

const design = (): Design => ({
  id: 'poster', title: 'Poster', width: 1080, height: 1080, unit: 'px', mode: 'corporate',
  createdAt: 0, updatedAt: 1, isSaved: true, background: '#000000',
  layers: [1, 2].map((id) => ({ id: String(id), name: 'Shape', type: 'rect', x: 0, y: 0,
    width: 100, height: 100, rotation: 0, visible: true, locked: false, opacity: 1, fill: '#ffffff' })),
});

describe('document updates and persistence', () => {
  it('reuses identical cloned layers and ignores timestamp-only changes', () => {
    const current = design();
    expect(mergeDesignUpdate(current, structuredClone(current))).toBe(current);
    expect(mergeDesignUpdate(current, { updatedAt: 10 })).toBe(current);
    const layers = structuredClone(current.layers);
    layers[1]!.x = 30;
    const updated = mergeDesignUpdate(current, { layers }, 10);
    expect(updated.layers[0]).toBe(current.layers[0]);
    expect(layerRevision(updated.layers[0]!)).toBe(layerRevision(current.layers[0]!));
    expect(layerRevision(updated.layers[1]!)).not.toBe(layerRevision(current.layers[1]!));
    expect(updated.layers[1]!.x).toBe(30);
    expect(updated.updatedAt).toBe(10);
  });

  it('keeps edits made during a slow API save while retaining the returned remote version', () => {
    const sent = design();
    const edited = mergeDesignUpdate(sent, { title: 'New title' }, 20);
    const synced: Design = { ...sent, remoteId: 'remote', remoteVersion: 2, syncStatus: 'synced' };
    const result = mergeSyncResult(edited, sent, synced);
    expect(result.title).toBe('New title');
    expect(result.remoteVersion).toBe(2);
    expect(result.syncStatus).toBe('local');
  });

  it('keeps revisions distinct when multiple edits arrive within one millisecond', () => {
    const sent = design();
    const edited = mergeDesignUpdate(sent, { title: 'Latest' }, sent.updatedAt);
    expect(edited.updatedAt).toBeGreaterThan(sent.updatedAt);
    const result = mergeSyncResult(edited, sent, { ...sent, remoteId: 'remote', remoteVersion: 1 });
    expect(result.title).toBe('Latest');
  });

  it('keeps uploaded image IDs when the editor returns a transformed image', () => {
    const current = design();
    current.layers[0] = { ...current.layers[0]!, type: 'image', imageUrl: 'data:image/png;base64,old', assetId: 'uploaded' };
    const incoming = { ...current.layers[0], x: 30, assetId: undefined };
    const updated = mergeDesignUpdate(current, { layers: [incoming, current.layers[1]!] });
    expect(updated.layers[0]!.assetId).toBe('uploaded');
    const replaced = mergeDesignUpdate(current, { layers: [{ ...incoming, imageUrl: 'data:image/png;base64,new' }] });
    expect(replaced.layers[0]!.assetId).toBeUndefined();
  });

  it('coalesces bursts of edits and flushes the latest document when leaving', async () => {
    const save = vi.fn(async (_design: Design) => {});
    const writer = createDesignPersistence(save, 300);
    for (let index = 0; index < 100; index++) writer.schedule({ ...design(), title: String(index) });
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].title).toBe('99');
    writer.schedule({ ...design(), title: 'Leaving' });
    writer.flushAll();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]![0].title).toBe('Leaving');
  });

  it('still saves during continuous editing instead of deferring forever', async () => {
    const save = vi.fn(async (_design: Design) => {});
    const writer = createDesignPersistence(save, 300);
    for (let index = 0; index < 20; index++) {
      writer.schedule({ ...design(), title: String(index) });
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].title).toBe('19');
  });
});

it('deduplicates simultaneous learning-event flushes', async () => {
  let finish!: (response: Response) => void;
  const send = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
  const recorder = new EventRecorder('/v1', send as typeof fetch);
  await recorder.start(true);
  await recorder.record([{ rule: 'contrast', class: 'base', outcome: 'applied', mode: 'corporate_base', style_id: null, occurred_at: 0 } as LearningEvent]);
  const first = recorder.flush();
  const second = recorder.flush();
  expect(send).toHaveBeenCalledTimes(1);
  finish(Response.json({ accepted: 1 }));
  await Promise.all([first, second]);
  recorder.stop();
});
