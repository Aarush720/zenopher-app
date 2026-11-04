import { expect, it } from 'vitest';
import { teacherPaint } from '../src/teacher/reviewPaint';
import type { Layer } from '../src/types';

it('uses a native verified flat image colour for contrast without changing the editor layer', () => {
  const layer = { type: 'image', fill: '#ffffff', imageUrl: 'data:image/png;base64,original', reviewFill: '#ff0000ff' } as Layer;
  expect(teacherPaint(layer)).toEqual({ kind: 'shape', shape: 'rect', fill: '#ff0000ff' });
  expect(layer.type).toBe('image');
  expect(layer.imageUrl).toBe('data:image/png;base64,original');
});
it('keeps genuine photos and missing or malformed colour metadata uncertain', () => {
  for (const reviewFill of [undefined, null, 'red', '#gg0000']) {
    expect(teacherPaint({ type: 'image', fill: '#fff', reviewFill } as Layer)).toEqual({ kind: 'image' });
  }
  expect(teacherPaint({ type: 'rect', fill: null } as unknown as Layer)).toEqual({ kind: 'image' });
});
it('preserves vector shapes and alpha when their colours are known', () => {
  expect(teacherPaint({ type: 'circle', fill: '#ff000080' } as Layer)).toEqual({ kind: 'shape', shape: 'ellipse', fill: '#ff000080' });
  expect(teacherPaint({ type: 'text', fill: '#fff' } as Layer)).toEqual({ kind: 'text' });
});
