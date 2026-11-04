import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { initSync, WasmTeacher } from '../../frontend/src/teacher/generated/zenopher_teacher.js';

initSync({ module: await readFile(new URL('../../frontend/src/teacher/generated/zenopher_teacher_bg.wasm', import.meta.url)) });
const layers = Array.from({ length: 1000 }, (_, index) => ({
  id: index + 1, kind: 'shape', bounds: { x: index % 100 * 10, y: Math.floor(index / 100) * 10, w: 5, h: 5 },
  visible: true, opacity: 1, version: 1, fill: { r: 1, g: 1, b: 1, a: 1 }, shape: 'rect',
}));
const snapshot = JSON.stringify({
  page: { width_px: 1080, height_px: 1080, background: { r: 0, g: 0, b: 0, a: 1 }, color_mode: 'rgb' },
  layers, mode: 'corporate_base', intent: 'screen',
});
const teacher = new WasmTeacher('');
teacher.set_level('corporate_base');
for (let index = 0; index < 25; index++) teacher.pump(snapshot, 10000 + index * 50);
const start = performance.now();
for (let index = 0; index < 200; index++) teacher.pump(snapshot, 20000 + index * 50);
console.log(JSON.stringify({ scenario: '1000 layers; 200 idle WASM pump calls', snapshotBytes: snapshot.length, totalMs: performance.now() - start }));
const schedulingStart = performance.now();
for (let index = 0; index < 200; index++) teacher.next_pump_delay(20000 + index * 50);
console.log(JSON.stringify({ scenario: '200 scheduler queries without serializing a snapshot', totalMs: performance.now() - schedulingStart }));
console.log(JSON.stringify({ nextWakeupAfterCompletion: teacher.next_pump_delay(30000), note: '-1 means the browser bridge schedules no idle wakeups' }));
teacher.free();

// Warmed full reviews, including all style metrics and finding-store updates.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
const metrics = [
  'colour.families', 'colour.dominant_share', 'colour.neutral_share', 'colour.accent_share',
  'grid.edge_share', 'hierarchy.ratio', 'text.count_sizes',
];
const style = {
  id: 'benchmark', version: 1, name: 'Benchmark', summary: 'Synthetic',
  families: [], uses: [], principles: [], examples: [], status: 'published',
  patterns: Object.fromEntries(metrics.map(id => [id, { target: [0.4, 0.8], tolerance: 0.2, weight: 0.1 }])),
};
style.content_hash = 'sha256:' + createHash('sha256').update(JSON.stringify(canonical(style))).digest('hex');
for (const [kind, count] of [['shape', 1000], ['text', 200]]) {
  const layers = Array.from({ length: count }, (_, index) => ({
    id: index + 1, kind,
    bounds: { x: (index * 131) % 1000, y: (index * 197) % 1000, w: 25, h: 20 },
    visible: true, opacity: 1, version: 1, shape: 'rect', fill: { r: 0.3, g: 0.4, b: 0.8, a: 1 },
    ...(kind === 'text' ? { text: {
      content: 'Test', size_px: 12, leading: 1.2, lines: 1, color: { r: 0.8, g: 0.8, b: 0.8, a: 1 },
    } } : {}),
  }));
  const snapshot = JSON.stringify({
    page: { width_px: 1080, height_px: 1080, background: { r: 1, g: 1, b: 1, a: 1 } },
    layers, intent: 'screen', mode: 'corporate_full',
  });
  const teacher = new WasmTeacher('');
  teacher.set_style_json(JSON.stringify(style));
  teacher.set_level('corporate_full');
  const samples = [];
  let maxSlice = 0;
  for (let run = 0; run < 14; run++) {
    teacher.run();
    const start = performance.now();
    while (teacher.next_pump_delay(10000) === 0) {
      const sliceStart = performance.now();
      teacher.pump(snapshot, 10000);
      if (run >= 4) maxSlice = Math.max(maxSlice, performance.now() - sliceStart);
    }
    if (run >= 4) samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({
    scenario: kind, layers: count, medianMs: (samples[4] + samples[5]) / 2,
    maxSliceMs: maxSlice, findings: JSON.parse(teacher.findings()).length,
  }));
  teacher.free();
}
