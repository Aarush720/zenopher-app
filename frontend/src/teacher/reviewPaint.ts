import type { Layer } from '../types';

const isHex = (value: unknown): value is string => typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);

/** Review data only: the editor's layer type and rendered image remain unchanged. */
export function teacherPaint(layer: Layer): {
  kind: 'text' | 'shape' | 'image';
  fill?: string;
  shape?: 'rect' | 'ellipse' | 'polygon';
} {
  if (layer.type === 'text') return { kind: 'text' };
  if (layer.type === 'image') {
    // PhotoCraft supplies this only after checking every exported pixel, including alpha.
    if (isHex(layer.reviewFill)) return { kind: 'shape', shape: 'rect', fill: layer.reviewFill };
    return { kind: 'image' };
  }
  // Unknown/gradient fills must not silently become an opaque black rectangle.
  if (!isHex(layer.fill)) return { kind: 'image' };
  const shape = layer.type === 'circle' ? 'ellipse' : layer.type === 'triangle' || layer.type === 'star' ? 'polygon' : 'rect';
  return { kind: 'shape', shape, fill: layer.fill };
}
