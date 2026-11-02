import React, { useState } from 'react';
import { ArrowUpRight, Square, FileText, CreditCard, Tv, Sliders } from 'lucide-react';
import { PresetSize } from '../types';
import { PRESET_SIZES } from '../data/presets';

interface TemplatesViewProps {
  onOpenPreset: (preset: PresetSize) => void;
  onUseTemplate: (template: { name: string; width: number; height: number; layers: any[]; mode: 'creative' | 'corporate'; styleId?: string }) => void;
}

const STARTER_TEMPLATES = [
  {
    id: 'tmpl-social-square',
    title: 'Typographic Social Frame',
    width: 1080,
    height: 1080,
    category: 'Social Media',
    mode: 'corporate' as const,
    styleId: 'bauhaus',
    layers: [
      {
        id: 'tmpl-l1',
        name: 'Background Card',
        type: 'rect' as const,
        x: 80,
        y: 80,
        width: 920,
        height: 920,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#2C2C2C',
        borderRadius: 22,
      },
      {
        id: 'tmpl-l2',
        name: 'Big Typography',
        type: 'text' as const,
        x: 140,
        y: 200,
        width: 800,
        height: 140,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#FFFFFF',
        text: 'ABSTRACT',
        fontSize: 72,
        fontFamily: 'Lufga',
        fontWeight: '800',
        textAlign: 'left' as const,
      },
    ],
  },
  {
    id: 'tmpl-deck-slide',
    title: 'Executive Presentation Slide',
    width: 1920,
    height: 1080,
    category: 'Corporate Deck',
    mode: 'corporate' as const,
    styleId: 'swiss-modern',
    layers: [
      {
        id: 'tmpl-s1',
        name: 'Header',
        type: 'text' as const,
        x: 120,
        y: 140,
        width: 1200,
        height: 100,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#FFFFFF',
        text: 'Strategic Architecture 2026',
        fontSize: 54,
        fontFamily: 'Lufga',
        fontWeight: '700',
        textAlign: 'left' as const,
      },
    ],
  },
  {
    id: 'tmpl-business-card',
    title: 'Minimalist Monospaced Card',
    width: 1050,
    height: 600,
    category: 'Print Media',
    mode: 'creative' as const,
    layers: [
      {
        id: 'tmpl-b1',
        name: 'Name Text',
        type: 'text' as const,
        x: 100,
        y: 180,
        width: 800,
        height: 80,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#FFFFFF',
        text: 'Aarush Singh',
        fontSize: 48,
        fontFamily: 'JetBrains Mono',
        fontWeight: '700',
        textAlign: 'left' as const,
      },
    ],
  },
  {
    id: 'tmpl-editorial-poster',
    title: 'Editorial Poster A4',
    width: 1240,
    height: 1754,
    category: 'Editorial Print',
    mode: 'corporate' as const,
    styleId: 'editorial-luxe',
    layers: [
      {
        id: 'tmpl-p1',
        name: 'Hero Serif',
        type: 'text' as const,
        x: 140,
        y: 280,
        width: 960,
        height: 240,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#FFFFFF',
        text: 'Zenith',
        fontSize: 120,
        fontFamily: 'Georgia',
        fontWeight: '700',
        textAlign: 'left' as const,
      },
    ],
  },
];

export const TemplatesView: React.FC<TemplatesViewProps> = ({
  onOpenPreset,
  onUseTemplate,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const filtered = activeCategory === 'all' 
    ? STARTER_TEMPLATES 
    : STARTER_TEMPLATES.filter((t) => t.category.toLowerCase().includes(activeCategory.toLowerCase()));

  const renderPresetArtwork = (preset: PresetSize) => {
    switch (preset.id) {
      case 'preset-instagram':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ width: '90px', height: '90px', borderRadius: '8px', background: '#161616', border: '2px solid #333333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Square size={32} color="var(--ui-icon)" />
            </div>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>1:1 Square</span>
          </div>
        );
      case 'preset-a4':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ width: '74px', height: '105px', borderRadius: '6px', background: '#161616', border: '2px solid #333333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={32} color="var(--ui-icon)" />
            </div>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>Standard A4</span>
          </div>
        );
      case 'preset-business-card':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ width: '120px', height: '68px', borderRadius: '6px', background: '#161616', border: '2px solid #333333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={30} color="var(--ui-icon)" />
            </div>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>3.5 × 2.0 in</span>
          </div>
        );
      case 'preset-slide':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ width: '136px', height: '76px', borderRadius: '6px', background: '#161616', border: '2px solid #333333', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Tv size={32} color="var(--ui-icon)" />
            </div>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>16:9 Widescreen</span>
          </div>
        );
      default:
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <div style={{ width: '90px', height: '90px', borderRadius: '8px', background: '#161616', border: '2px dashed #444444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Sliders size={32} color="var(--ui-icon)" />
            </div>
            <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>Custom Dimensions</span>
          </div>
        );
    }
  };

  return (
    <div className="workspace" style={{ gridTemplateColumns: '1fr' }}>
      <section 
        className="floating-panel"
        style={{
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '28px',
          overflowY: 'auto',
          height: '100%',
        }}
      >
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>
            Templates & Presets
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Curated format presets and developer-crafted layouts built strictly within the monochrome system.
          </p>
        </div>

        {/* Section 1: Presets Bar */}
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '14px', color: 'var(--text)' }}>
            Canvas Presets
          </h3>
          <div className="grid-cards">
            {PRESET_SIZES.map((preset) => (
              <div 
                key={preset.id} 
                className="design-card"
                onClick={() => onOpenPreset(preset)}
              >
                <div className="design-card-preview">
                  {renderPresetArtwork(preset)}
                </div>
                <div className="design-card-info">
                  <div className="design-card-title">{preset.name}</div>
                  <div className="design-card-subtitle">{preset.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Designer Templates */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)' }}>
              Developer Templates
            </h3>
            <div style={{ display: 'flex', background: 'var(--container)', borderRadius: '6px', padding: '2px', gap: '2px' }}>
              {['all', 'social', 'corporate', 'print'].map((cat) => (
                <button
                  key={cat}
                  className={activeCategory === cat ? 'selected' : ''}
                  style={{ height: '28px', padding: '0 10px', fontSize: '11px', textTransform: 'capitalize', borderRadius: '6px' }}
                  onClick={() => setActiveCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="grid-cards">
            {filtered.map((tmpl) => (
              <div 
                key={tmpl.id} 
                className="design-card"
                onClick={() => onUseTemplate({
                  name: tmpl.title,
                  width: tmpl.width,
                  height: tmpl.height,
                  layers: tmpl.layers,
                  mode: tmpl.mode,
                  styleId: tmpl.styleId,
                })}
              >
                <div className="design-card-preview">
                  <svg viewBox="0 0 400 275" style={{ width: '100%', height: '100%' }}>
                    <rect width="100%" height="100%" fill="#0A0A0A" />
                    <rect x="50" y="40" width="300" height="195" rx="6" fill="#141414" stroke="#252525" strokeWidth="2" />
                    <text x="200" y="145" fill="#FFFFFF" fontSize="24" fontFamily="var(--font-sans)" fontWeight="800" textAnchor="middle">
                      {tmpl.category}
                    </text>
                  </svg>

                  <div 
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      width: '28px',
                      height: '28px',
                      background: 'rgba(0,0,0,0.7)',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ArrowUpRight size={15} color="var(--text)" />
                  </div>
                </div>

                <div className="design-card-info">
                  <div className="design-card-title">{tmpl.title}</div>
                  <div className="design-card-subtitle">{tmpl.width} × {tmpl.height} px • {tmpl.mode}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
