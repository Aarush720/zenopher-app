import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WorkerTeacherBridge } from '../src/teacher/WorkerTeacherBridge';
import type { TeacherHost } from '../../zenopher-teacher/web/src/teacher/types';
import type { TeacherRequest, TeacherResponse } from '../src/teacher/workerProtocol';

class TestWorker {
  static latest: TestWorker;
  requests: TeacherRequest[] = [];
  onmessage: ((event: { data: TeacherResponse }) => void) | null = null;
  onerror: unknown;
  terminate = vi.fn();
  constructor() { TestWorker.latest = this; }
  postMessage(request: TeacherRequest) { this.requests.push(request); }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', TestWorker);
  vi.stubGlobal('document', Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('sessionStorage', { getItem: () => null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function client() {
  const host = { snapshotJson: vi.fn(() => '{"layers":[]}'), runCommands: vi.fn() } as unknown as TeacherHost;
  return { bridge: new WorkerTeacherBridge(host, '/v1', false), host };
}

it('combines a burst of changes into one snapshot and worker message', async () => {
  const { bridge, host } = client();
  for (let index = 0; index < 100; index++) bridge.onChange([index % 5], index === 50);
  expect(host.snapshotJson).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(50);
  expect(host.snapshotJson).toHaveBeenCalledTimes(1);
  expect(TestWorker.latest.requests).toHaveLength(1);
  expect(TestWorker.latest.requests[0]!.args).toEqual([[0, 1, 2, 3, 4], true]);
  bridge.stop();
});

it('cancels pending snapshots and ignores commands from a closed document', async () => {
  const { bridge, host } = client();
  bridge.onChange([1]);
  bridge.stop();
  await vi.advanceTimersByTimeAsync(1000);
  TestWorker.latest.onmessage?.({ data: { type: 'commands', commandId: 1, commands: [] } });
  expect(host.snapshotJson).not.toHaveBeenCalled();
  expect(host.runCommands).not.toHaveBeenCalled();
  expect(TestWorker.latest.terminate).toHaveBeenCalledTimes(1);
});

it('rejects an interrupted startup without installing page event listeners later', async () => {
  const addListener = vi.spyOn(document, 'addEventListener');
  const { bridge } = client();
  const starting = bridge.start();
  bridge.stop();
  await expect(starting).rejects.toThrow('closed');
  TestWorker.latest.onmessage?.({ data: { type: 'result', id: 1 } });
  expect(addListener).not.toHaveBeenCalled();
});

it('flushes debounced edits before applying a fix, including in a hidden tab', async () => {
  const { bridge } = client();
  bridge.onChange([1]);
  Object.assign(document, { hidden: true });
  const applying = bridge.apply('contrast@1');
  const requests = TestWorker.latest.requests;
  expect(requests.map(request => request.method)).toEqual(['onChange', 'apply']);
  TestWorker.latest.onmessage?.({ data: { type: 'result', id: requests[1]!.id, error: 'The design changed' } });
  await expect(applying).rejects.toThrow('changed');
  bridge.stop();
});
