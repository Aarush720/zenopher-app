import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { initSync, WasmTeacher } from '../src/teacher/generated/zenopher_teacher';
import { snapshotFor } from '../src/teacher/useRustTeacher';
import type { Design, Layer } from '../src/types';
initSync({ module: await readFile(new URL('../src/teacher/generated/zenopher_teacher_bg.wasm', import.meta.url)) });

function review(fill: string | null, withRedCover: boolean, opacity = 1, coverOpacity = 1) {
  const common = { x: 0, y: 0, width: 1080, height: 1080, visible: true, opacity: 1, rotation: 0, locked: false };
  const layers = [
    { ...common, id: 'photocraft-1', name: 'Background', type: 'image', fill: '#ffffff', imageUrl: 'native-background.png', reviewFill: fill },
    ...(withRedCover ? [{ ...common, id: 'photocraft-2', name: 'Red', type: 'rect', fill: '#ff0000', opacity: coverOpacity }] : []),
    { ...common, id: 'photocraft-3', name: 'Title', type: 'text', x: 50, y: 50, width: 300, height: 50, fill: '#eeeeee', text: 'Title', fontSize: 32, opacity },
  ] as Layer[];
  const design = { id: 'native', mode: 'corporate', editorRevision: 1, width: 1080, height: 1080, unit: 'px', background: '#ffffff', layers } as Design;
  const snapshot = snapshotFor(design, new Map(layers.map((layer, i) => [layer.id, i + 1])));
  const teacher = new WasmTeacher('');
  try {
    teacher.set_level('corporate_base');
    for (let tick = 0; tick < 20 && teacher.next_pump_delay(1000) === 0; tick++) teacher.pump(snapshot, 1000);
    return JSON.parse(teacher.findings()) as Array<{explanation: string; finding: {rule: string; measurement_confidence: number; fix: {safety: string} | null}}>;
  } finally { teacher.free(); }
}

it('offers Apply for light text on a native verified white raster background', () => {
  const contrast = review('#ffffffff', false).find(view => view.finding.rule === 'contrast');
  expect(contrast?.finding.measurement_confidence).toBe(1);
  expect(contrast?.finding.fix?.safety).toBe('safe');
});
it('does not invent a white-background failure when an opaque red shape covers a photo', () => {
  expect(review(null, true).some(view => view.finding.rule === 'contrast')).toBe(false);
});
it('keeps a genuine unknown photo manual, and does not promise an impossible colour-only fix', () => {
  const photo = review(null, false).find(view => view.finding.rule === 'contrast');
  expect(photo?.finding.fix).toBeNull();
  expect(photo?.explanation).toContain('background is too uncertain');
  expect(review(null, true, 1, 0.5).find(view => view.finding.rule === 'contrast')?.finding.fix).toBeNull();
  const faint = review('#ffffffff', false, 0.1).find(view => view.finding.rule === 'contrast');
  expect(faint?.finding.fix).toBeNull();
  expect(faint?.explanation).toContain('transparency');
});
