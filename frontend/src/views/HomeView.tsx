import React, { useState } from 'react';
import { 
  ArrowRight, 
  MoreVertical, 
  Play, 
  Trash2, 
  Copy, 
  Edit3, 
  Download,
  Plus,
  FolderOpen,
  Square,
  FileText,
  CreditCard,
  Tv,
  Sliders,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Design, PresetSize } from '../types';
import { PRESET_SIZES } from '../data/presets';

interface HomeViewProps {
  profileName: string;
  isFirstLaunch: boolean;
  recentDesigns: Design[];
  savedDesigns: Design[];
  onNewDesign: () => void;
  onOpenPreset: (preset: PresetSize) => void;
  onOpenDesign: (design: Design, sourceRect?: DOMRect) => void;
  onOpenFile: () => void;
  onNavigate: (dest: any) => void;
  onDeleteDesign: (id: string) => void;
  onDuplicateDesign: (design: Design) => void;
  onRenameDesign: (design: Design) => void;
  onExportDesign: (design: Design) => void;
  loadingDesignId?: string | null;
}

export const HomeView: React.FC<HomeViewProps> = ({
  profileName,
  isFirstLaunch,
  recentDesigns,
  savedDesigns,
  onNewDesign,
  onOpenPreset,
  onOpenDesign,
  onOpenFile,
  onNavigate,
  onDeleteDesign,
  onDuplicateDesign,
  onRenameDesign,
  onExportDesign,
  loadingDesignId,
}) => {
  const [activeMenuDesignId, setActiveMenuDesignId] = useState<string | null>(null);

  // Render high-impact visual artwork for cards (large square viewport)
  const renderCardArtwork = (design: Design) => {
    if (design.id === 'design-zen-brand') {
      return (
        <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%' }}>
          <rect width="100%" height="100%" fill="#0A0A0A" />
          {/* Isometric grid */}
          <line x1="50" y1="0" x2="50" y2="400" stroke="#151515" strokeWidth="1.5" />
          <line x1="350" y1="0" x2="350" y2="400" stroke="#151515" strokeWidth="1.5" />
          <line x1="0" y1="200" x2="400" y2="200" stroke="#151515" strokeWidth="1.5" />

          {/* Bold Geometric Sculpture */}
          <circle cx="200" cy="165" r="115" fill="#141414" stroke="#2C2C2C" strokeWidth="2.5" />
          <circle cx="200" cy="165" r="80" fill="#1A1A1A" stroke="#444444" strokeWidth="2" />
          <rect x="90" y="85" width="220" height="160" rx="8" fill="none" stroke="#FFFFFF" strokeWidth="2.5" opacity="0.9" />
          <line x1="90" y1="85" x2="310" y2="245" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.4" />
          <line x1="310" y1="85" x2="90" y2="245" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.4" />

          <text x="200" y="325" fill="#FFFFFF" fontSize="22" fontFamily="var(--font-sans)" fontWeight="800" textAnchor="middle" letterSpacing="6">
            PRECISION
          </text>
          <text x="200" y="352" fill="#666666" fontSize="12" fontFamily="var(--font-mono)" textAnchor="middle" letterSpacing="1.5">
            BAUHAUS // GEOMETRY
          </text>
        </svg>
      );
    }

    if (design.id === 'design-slide-deck') {
      return (
        <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%' }}>
          <rect width="100%" height="100%" fill="#080808" />
          {/* Architectural 3-column composition */}
          <rect x="36" y="55" width="98" height="230" rx="8" fill="#141414" stroke="#282828" strokeWidth="2" />
          <rect x="151" y="55" width="98" height="230" rx="8" fill="#1A1A1A" stroke="#383838" strokeWidth="2" />
          <rect x="266" y="55" width="98" height="230" rx="8" fill="#242424" stroke="#484848" strokeWidth="2" />

          <circle cx="200" cy="125" r="32" fill="#FFFFFF" />
          <path d="M185 125 L200 110 L215 125 L200 140 Z" fill="#000000" />

          <text x="200" y="332" fill="#FFFFFF" fontSize="17" fontFamily="var(--font-sans)" fontWeight="700" textAnchor="middle">
            Geometric Coherence
          </text>
          <text x="200" y="356" fill="#666666" fontSize="12" fontFamily="var(--font-mono)" textAnchor="middle">
            SWISS MODERNISM • 16:9
          </text>
        </svg>
      );
    }

    if (design.id === 'design-creative-sketch') {
      return (
        <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%' }}>
          <rect width="100%" height="100%" fill="#0A0A0A" />
          {/* Lufga Typography Specimen Showcase */}
          <text x="44" y="195" fill="#FFFFFF" fontSize="126" fontFamily="var(--font-sans)" fontWeight="800" letterSpacing="-4">
            Lufga
          </text>
          <circle cx="340" cy="115" r="18" fill="#2C2C2C" stroke="#444444" strokeWidth="2" />
          <circle cx="340" cy="115" r="7" fill="#FFFFFF" />
          
          <rect x="46" y="235" width="308" height="4" rx="2" fill="#222222" />
          <rect x="46" y="235" width="160" height="4" rx="2" fill="#FFFFFF" opacity="0.85" />

          <text x="46" y="280" fill="#888888" fontSize="14" fontFamily="var(--font-sans)">
            Subtle humanist precision • Highly legible
          </text>
          <text x="46" y="310" fill="#555555" fontSize="11" fontFamily="var(--font-mono)">
            ABCDEFGHIJKLM • 0123456789
          </text>
        </svg>
      );
    }

    // Dynamic fallback for user-created designs
    const textLayer = design.layers.find((l) => l.type === 'text');
    return (
      <div 
        style={{ 
          width: '100%', 
          height: '100%', 
          background: design.background || '#0D0D0D',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '28px',
          textAlign: 'center',
          gap: '12px',
        }}
      >
        <Layers size={48} color="var(--text-secondary)" style={{ opacity: 0.8 }} />
        <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', maxWidth: '85%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {textLayer?.text || design.title}
        </div>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {design.width} × {design.height} px
        </span>
      </div>
    );
  };

  // Render Large Preset Viewport
  const renderPresetArtwork = (preset: PresetSize) => {
    switch (preset.id) {
      case 'preset-instagram':
        return (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', background: '#090909' }}>
            <div style={{ width: '160px', height: '160px', borderRadius: '10px', background: '#141414', border: '2px solid #333333', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Square size={44} color="var(--ui-icon)" />
              <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#FFFFFF' }}>1080 × 1080</span>
            </div>
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>1:1 Square Post</span>
          </div>
        );
      case 'preset-a4':
        return (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', background: '#090909' }}>
            <div style={{ width: '130px', height: '184px', borderRadius: '8px', background: '#141414', border: '2px solid #333333', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <FileText size={44} color="var(--ui-icon)" />
              <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#FFFFFF' }}>A4 Print</span>
            </div>
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>1240 × 1754 px</span>
          </div>
        );
      case 'preset-business-card':
        return (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', background: '#090909' }}>
            <div style={{ width: '210px', height: '120px', borderRadius: '8px', background: '#141414', border: '2px solid #333333', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <CreditCard size={42} color="var(--ui-icon)" />
              <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#FFFFFF' }}>3.5 × 2.0 in</span>
            </div>
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>1050 × 600 px</span>
          </div>
        );
      case 'preset-slide':
        return (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', background: '#090909' }}>
            <div style={{ width: '228px', height: '128px', borderRadius: '8px', background: '#141414', border: '2px solid #333333', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Tv size={42} color="var(--ui-icon)" />
              <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#FFFFFF' }}>1920 × 1080</span>
            </div>
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>16:9 Widescreen</span>
          </div>
        );
      default:
        return (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', background: '#090909' }}>
            <div style={{ width: '160px', height: '160px', borderRadius: '10px', background: '#141414', border: '2px dashed #444444', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Sliders size={44} color="var(--ui-icon)" />
              <span style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: '#FFFFFF' }}>Custom</span>
            </div>
            <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>Freeform Dimensions</span>
          </div>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Full-width Gallery */}
      <section 
        className="floating-panel"
        style={{
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          overflowY: 'auto',
          flex: 1,
        }}
      >
        <div className="home-hero">
          <div className="home-hero-copy">
            <span className="home-hero-eyebrow">
              {isFirstLaunch ? 'Your workspace is ready' : 'Back to your workspace'}
            </span>
            <h2>
              {profileName ? `Good to see you, ${profileName.split(' ')[0]}.` : 'Make space for better ideas.'}
            </h2>
            <p>
              Shape clear, considered work from a quiet canvas. Start with a blank design or pick up where you left off.
            </p>
          </div>
          <div className="home-hero-actions">
            <button className="primary" onClick={onNewDesign}>
              <Plus size={15} />
              <span>New design</span>
            </button>
            <button onClick={onOpenFile}>
              <FolderOpen size={15} />
              <span>Open file</span>
            </button>
          </div>
          <Sparkles className="home-hero-sparkle" size={18} aria-hidden="true" />
        </div>

        {/* Section 1: Recent designs */}
        {recentDesigns.length > 0 && (
          <div className="gallery-section">
            <div className="gallery-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                Recent designs
              </h3>
              <button
                style={{
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                }}
                onClick={() => onNavigate('designs')}
              >
                <span>See all</span>
                <ArrowRight size={14} />
              </button>
            </div>

            <div className="gallery-tile-row">
              {recentDesigns.slice(0, 3).map((design) => (
                <div 
                  key={design.id} 
                  className="design-card"
                  onClick={(event) => onOpenDesign(design, event.currentTarget.getBoundingClientRect())}
                >
                  <div className="design-card-preview">
                    {renderCardArtwork(design)}

                    <button
                      className="btn-square-sm"
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        background: 'rgba(0,0,0,0.75)',
                        color: 'var(--text)',
                        borderRadius: '6px',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuDesignId(activeMenuDesignId === design.id ? null : design.id);
                      }}
                      aria-label="Options"
                    >
                      <MoreVertical size={15} />
                    </button>

                    {activeMenuDesignId === design.id && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '48px',
                          right: '12px',
                          background: 'var(--on-surface)',
                          borderRadius: '8px',
                          padding: '6px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px',
                          zIndex: 50,
                          minWidth: '135px',
                          boxShadow: '0 8px 24px rgba(0,0,0,0.9)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          style={{ height: '30px', justifyContent: 'flex-start', padding: '0 10px', fontSize: '12px', borderRadius: '6px', gap: '8px' }}
                          onClick={() => {
                            setActiveMenuDesignId(null);
                            onOpenDesign(design);
                          }}
                        >
                          <Play size={12} />
                          <span>Open</span>
                        </button>
                        <button
                          style={{ height: '30px', justifyContent: 'flex-start', padding: '0 10px', fontSize: '12px', borderRadius: '6px', gap: '8px' }}
                          onClick={() => {
                            setActiveMenuDesignId(null);
                            onRenameDesign(design);
                          }}
                        >
                          <Edit3 size={12} />
                          <span>Rename</span>
                        </button>
                        <button
                          style={{ height: '30px', justifyContent: 'flex-start', padding: '0 10px', fontSize: '12px', borderRadius: '6px', gap: '8px' }}
                          onClick={() => {
                            setActiveMenuDesignId(null);
                            onDuplicateDesign(design);
                          }}
                        >
                          <Copy size={12} />
                          <span>Duplicate</span>
                        </button>
                        <button
                          style={{ height: '30px', justifyContent: 'flex-start', padding: '0 10px', fontSize: '12px', borderRadius: '6px', gap: '8px' }}
                          onClick={() => {
                            setActiveMenuDesignId(null);
                            onExportDesign(design);
                          }}
                        >
                          <Download size={12} />
                          <span>Export .zph</span>
                        </button>
                        <button
                          style={{ height: '30px', justifyContent: 'flex-start', padding: '0 10px', fontSize: '12px', borderRadius: '6px', gap: '8px', color: '#FF6B6B' }}
                          onClick={() => {
                            setActiveMenuDesignId(null);
                            onDeleteDesign(design.id);
                          }}
                        >
                          <Trash2 size={12} />
                          <span>Move to Trash</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {loadingDesignId === design.id && (
                    <div className="tile-loading-overlay" role="status" aria-label="Opening design">
                      <Layers className="tile-loading-illustration" size={42} />
                      <span>Opening canvas</span>
                    </div>
                  )}

                  <div className="design-card-info">
                    <div className="design-card-title">{design.title}</div>
                    <div className="design-card-subtitle">
                      {design.styleId ? `${design.styleId.charAt(0).toUpperCase() + design.styleId.slice(1)} • ` : ''}
                      {design.mode === 'corporate' ? 'Corporate' : 'Creative'} Design
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section 2: Start from a preset */}
        <div className="gallery-section">
          <div className="gallery-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.3px' }}>
              Start from a preset
            </h3>
            <button
              style={{
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
              }}
              onClick={() => onNavigate('templates')}
            >
              <span>See all</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div className="gallery-tile-row">
            {PRESET_SIZES.slice(0, 3).map((preset) => (
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

        {/* Section 3: Saved designs */}
        {savedDesigns.length > 0 && (
          <div className="gallery-section">
            <div className="gallery-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.3px' }}>
                Saved designs
              </h3>
              <button
                style={{
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                }}
                onClick={() => onNavigate('designs')}
              >
                <span>See all</span>
                <ArrowRight size={14} />
              </button>
            </div>

            <div className="gallery-tile-row">
              {savedDesigns.slice(0, 3).map((design) => (
                <div 
                  key={design.id} 
                  className="design-card"
                  onClick={(event) => onOpenDesign(design, event.currentTarget.getBoundingClientRect())}
                >
                  <div className="design-card-preview">
                    {renderCardArtwork(design)}
                  </div>
                  {loadingDesignId === design.id && (
                    <div className="tile-loading-overlay" role="status" aria-label="Opening design">
                      <Layers className="tile-loading-illustration" size={42} />
                      <span>Opening canvas</span>
                    </div>
                  )}
                  <div className="design-card-info">
                    <div className="design-card-title">{design.title}</div>
                    <div className="design-card-subtitle">
                      {design.mode === 'corporate' ? 'Corporate' : 'Creative'} • {design.layers.length} layers
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
