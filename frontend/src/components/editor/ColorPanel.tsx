import React from 'react';
import type { Design, Layer } from '../../types';

interface ColorPanelProps {
  design: Design;
  selectedLayer: Layer | null;
  onUpdateLayer: (id: string, updates: Partial<Layer>) => void;
  onUpdateDesign: (updates: Partial<Design>) => void;
}

const SWATCHES = [
  '#000000', '#111111', '#2C2C2C', '#3A3A3A', '#666666', '#A3A3A3', '#E0E0E0', '#FFFFFF',
  '#2f5fe0', '#fff500', '#ff4d4d', '#22c55e',
];

function normalizeHex(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const hex = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return '#' + hex.slice(1).split('').map((c) => c + c).join('');
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) return '#' + hex;
  return fallback;
}

export const ColorPanel: React.FC<ColorPanelProps> = ({
  design,
  selectedLayer,
  onUpdateLayer,
  onUpdateDesign,
}) => {
  const targetLayer = selectedLayer ?? null;
  const layerFill = normalizeHex(targetLayer?.fill ?? design.layers.find((l) => l.type === 'text')?.fill, '#FFFFFF');

  const setFirstTextFill = (fill: string) => {
    if (targetLayer) {
      onUpdateLayer(targetLayer.id, { fill });
      return;
    }
    // No selection (your screenshot): fix the first text layer so the demo
    // canvas reads instantly. White-on-white is invisible — this rescues it.
    const first = design.layers.find((l) => l.type === 'text' && l.visible !== false);
    if (first) onUpdateLayer(first.id, { fill });
  };

  return (
    <section aria-label="Color" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Color</h2>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {targetLayer ? targetLayer.name : design.layers.length ? 'No selection — editing first text' : 'Canvas'}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="color"
            value={layerFill}
            onChange={(e) => setFirstTextFill(e.target.value)}
            style={{ width: '44px', height: '32px', padding: 0, border: '2px solid #fff', borderRadius: '6px', background: 'none', cursor: 'pointer' }}
          />
          <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: '13px' }}>{layerFill.toUpperCase()}</span>
          <span>Text fill — click to fix the white text</span>
        </label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {SWATCHES.map((swatch) => (
            <button
              key={swatch}
              title={swatch}
              aria-label={`Set fill to ${swatch}`}
              onClick={() => setFirstTextFill(swatch)}
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '6px',
                background: swatch,
                border: layerFill.toLowerCase() === swatch.toLowerCase() ? '3px solid #fff' : '1px solid rgba(255,255,255,0.4)',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
          Tip for demo: tap the black swatch — white “Subtitle Copy” on white canvas becomes visible instantly.
        </p>
      </div>

      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="color"
          value={normalizeHex(design.background, '#111111')}
          onChange={(e) => onUpdateDesign({ background: e.target.value })}
          style={{ width: '36px', height: '28px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
        />
        <span style={{ color: 'var(--text)', fontWeight: 600 }}>{normalizeHex(design.background, '#111111').toUpperCase()}</span>
        <span>Canvas</span>
      </label>
    </section>
  );
};
