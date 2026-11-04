import initTeacher, { WasmTeacher } from './generated/zenopher_teacher';
import { TeacherBridge } from '../../../zenopher-teacher/web/src/teacher/bridge';
import { EventRecorder } from '../../../zenopher-teacher/web/src/teacher/eventRecorder';
import { CatalogSync } from '../../../zenopher-teacher/web/src/teacher/catalogSync';
import type { ApplyAllPlan, Level } from '../../../zenopher-teacher/web/src/teacher/types';
import type { TeacherRequest, TeacherResponse } from './workerProtocol';

const scope = globalThis as unknown as {
  postMessage(message: TeacherResponse): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<TeacherRequest>) => void): void;
};
let bridge: TeacherBridge | null = null;
let recorder: EventRecorder | null = null;
let snapshot = '';
let starting: Promise<void> | null = null;
let commandSequence = 0;
const commandResults = new Map<number, { resolve(): void; reject(error: Error): void }>();
let accessToken: string | null = null;
const authorizedFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  return fetch(input, { ...init, headers, credentials: 'include' });
};

scope.addEventListener('message', (event) => { void handle(event.data); });

async function handle(request: TeacherRequest) {
  try {
    if (request.snapshot !== undefined) snapshot = request.snapshot;
    if (request.token !== undefined) accessToken = request.token;
    const [first, second] = request.args;
    let value: unknown;
    if (request.method === 'start') {
      if (starting) throw new Error('The teacher has already started.');
      starting = (async () => {
        await initTeacher();
        const api = String(first);
        recorder = new EventRecorder(api, authorizedFetch);
        bridge = new TeacherBridge(new WasmTeacher(''), {
          now: () => Date.now(),
          snapshotJson: () => snapshot,
          runCommands: (commands) => new Promise<void>((resolve, reject) => {
            const commandId = ++commandSequence;
            commandResults.set(commandId, { resolve, reject });
            scope.postMessage({ type: 'commands', commandId, commands });
          }),
          selectLayers: (ids) => scope.postMessage({ type: 'select', ids }),
          renderPagePng: () => Promise.reject(new Error('Rendering is handled by the editor.')),
        }, recorder, new CatalogSync(api, authorizedFetch));
        bridge.subscribe((state) => scope.postMessage({ type: 'state', state }));
        await recorder.start(Boolean(second));
        await bridge.start();
      })();
      await starting;
    } else {
      await starting;
      if (!bridge) throw new Error('The teacher has not started.');
      switch (request.method) {
        case 'commandsDone': {
          const result = commandResults.get(Number(first));
          commandResults.delete(Number(first));
          if (second) result?.reject(new Error(String(second))); else result?.resolve();
          break;
        }
        case 'setLevel': bridge.setLevel(first as Level); break;
        case 'setStyle': value = await bridge.setStyle(first as { id: string; version: number } | null); break;
        case 'onChange': bridge.onChange(first as number[], Boolean(second)); break;
        case 'gestureStart': bridge.gestureStart(); break;
        case 'gestureEnd': bridge.gestureEnd(); break;
        case 'apply': await bridge.apply(String(first)); break;
        case 'planApplyAll': value = bridge.planApplyAll(); break;
        case 'commitApplyAll': await bridge.commitApplyAll(first as ApplyAllPlan); break;
        case 'onUndo': await bridge.onUndo(); break;
        case 'setConsent': await recorder?.setConsent(Boolean(first)); break;
        case 'flush': await recorder?.flush(); break;
        case 'pause': bridge.setPaused(true); break;
        case 'resume': bridge.setPaused(false); break;
        default: throw new Error('Unknown teacher operation.');
      }
    }
    scope.postMessage({ type: 'result', id: request.id, value });
  } catch (error) {
    scope.postMessage({ type: 'result', id: request.id, error: error instanceof Error ? error.message : String(error) });
  }
}
