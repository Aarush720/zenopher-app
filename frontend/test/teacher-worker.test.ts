import { expect, it } from 'vitest';
import { Worker } from 'node:worker_threads';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../../zenopher-backend/node_modules/esbuild/lib/main.js';
import type { TeacherResponse, TeacherState } from '../src/teacher/workerProtocol';

it('runs the real teacher WASM on a separate thread and returns findings', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'zenopher-teacher-worker-'));
  let worker: Worker | undefined;
  try {
    const outfile = path.join(directory, 'worker.mjs');
    await build({
      entryPoints: [fileURLToPath(new URL('../src/teacher/teacher.worker.ts', import.meta.url))],
      outfile, bundle: true, format: 'esm', platform: 'browser', target: 'es2022',
    });
    await copyFile(fileURLToPath(new URL('../src/teacher/generated/zenopher_teacher_bg.wasm', import.meta.url)), path.join(directory, 'zenopher_teacher_bg.wasm'));
    // Node's real worker thread supplies the browser worker transport. Only the
    // file:// asset fetch is adapted; the WASM and teacher implementation are real.
    worker = new Worker(`
      const { parentPort, workerData, threadId } = require('node:worker_threads');
      const { readFile } = require('node:fs/promises');
      const { pathToFileURL } = require('node:url');
      globalThis.postMessage = (data) => parentPort.postMessage(data);
      globalThis.addEventListener = (_, handler) => parentPort.on('message', (data) => handler({ data }));
      globalThis.fetch = async (url) => new Response(await readFile(new URL(url)), { headers: { 'content-type': 'application/wasm' } });
      import(pathToFileURL(workerData).href).then(() => parentPort.postMessage({ type: 'ready', threadId }));
    `, { eval: true, workerData: outfile });
    let sequence = 0;
    const events: TeacherState[] = [];
    const commands: unknown[] = [];
    worker.on('message', (message: TeacherResponse) => {
      if (message.type === 'state') events.push(message.state);
      if (message.type === 'commands') {
        commands.push(...message.commands);
        worker!.postMessage({ id: ++sequence, method: 'commandsDone', args: [message.commandId] });
      }
    });
    const ready = await new Promise<{ threadId: number }>((resolve, reject) => {
      worker!.on('error', reject);
      worker!.on('message', (message) => { if (message.type === 'ready') resolve(message); });
    });
    expect(ready.threadId).toBeGreaterThan(0);
    const call = (method: string, args: unknown[] = [], snapshot?: string) => new Promise<unknown>((resolve, reject) => {
      const id = ++sequence;
      const listener = (message: TeacherResponse) => {
        if (message.type !== 'result' || message.id !== id) return;
        worker!.off('message', listener);
        if (message.error) reject(new Error(message.error)); else resolve(message.value);
      };
      worker!.on('message', listener);
      worker!.postMessage({ id, method, args, snapshot });
    });
    const snapshot = JSON.stringify({
      page: { width_px: 1080, height_px: 1080, background: { r: 1, g: 1, b: 1, a: 1 }, color_mode: 'rgb' },
      mode: 'corporate_base', intent: 'screen',
      layers: [{ id: 1, kind: 'text', bounds: { x: 10, y: 10, w: 200, h: 15 }, visible: true, opacity: 1, version: 1,
        text: { content: 'Low contrast', font_family: 'Arial', size_px: 10, leading: 1.2, tracking: 0, bold: false,
          color: { r: 0.9, g: 0.9, b: 0.9, a: 1 }, lines: 1 } }],
    });
    const starting = call('start', ['/v1', false], snapshot);
    const level = call('setLevel', ['corporate_base']);
    await Promise.all([starting, level]);
    await expect.poll(() => events.some((state) => state.findings.some((view) => view.finding.rule === 'contrast'))).toBe(true);
    const plan = await call('planApplyAll') as { fixes: unknown[] };
    expect(plan.fixes.length).toBeGreaterThan(0);
    await call('commitApplyAll', [plan]);
    expect(commands.length).toBeGreaterThan(0);
    await call('onChange', [[1], false], snapshot);
    await expect(call('planApplyAll')).rejects.toThrow('changed');
    await call('pause');
    await call('resume');
    await call('setConsent', [false]);
  } finally {
    await worker?.terminate();
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
