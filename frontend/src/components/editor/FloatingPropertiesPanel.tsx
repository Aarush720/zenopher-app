import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify,
  Sliders, 
  CheckCircle, 
  Maximize, 
  Type, 
  Palette, 
  Move, 
  CornerDownRight
} from 'lucide-react';
import { Design, Layer, ReviewFinding } from '../../types';
import { ReviewPanel } from './ReviewPanel';
import { ApiCritiqueResult } from '../../services/api';

interface FloatingPropertiesPanelProps {
  design: Design;
  selectedLayer: Layer | null;
  onUpdateLayer: (id: string, updates: Partial<Layer>) => void;
  onUpdateDesign: (updates: Partial<Design>) => void;
  findings: ReviewFinding[];
  onApplyFix: (finding: ReviewFinding) => void;
  onApplyAllFixes: () => void;
  onOpenStylePicker: () => void;
  onRequestCloudCritique?: () => Promise<ApiCritiqueResult>;
  cloudReviewAvailable?: boolean;
}

export const FloatingPropertiesPanel: React.FC<FloatingPropertiesPanelProps> = ({
  design,
  selectedLayer,
  onUpdateLayer,
  onUpdateDesign,
  findings,
  onApplyFix,
  onApplyAllFixes,
  onOpenStylePicker,
  onRequestCloudCritique,
  cloudReviewAvailable,
}) => {
  // In corporate mode, activeTab can be 'properties' or 'review'
  // In creative mode, it is strictly locked to 'properties'
  const isCorporate = design.mode === 'corporate';
  const [activeTab, setActiveTab] = useState<'properties' | 'review'>('properties');

  // Accordion open/collapse states
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    transform: true,
    alignment: true,
    typography: true,
    color: true,
    spacing: false,
    effects: true,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleLayerPropChange = (key: keyof Layer, val: any) => {
    if (!selectedLayer) return;
    if (typeof val === 'number' && !Number.isFinite(val)) return;
    onUpdateLayer(selectedLayer.id, { [key]: val });
  };

  const parseNumber = (value: string, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  // Preset Monochrome Palette Swatches
  const MONO_SWATCHES = ['#000000', '#111111', '#2C2C2C', '#3A3A3A', '#666666', '#A3A3A3', '#E0E0E0', '#FFFFFF'];

  return (
    <aside 
      className="floating-panel properties-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px',
        gap: '12px',
        overflow: 'hidden',
      }}
    >
      {/* Top Tab Bar (Corporate mode gets Review toggle; Creative mode is purely Properties) */}
      {isCorporate ? (
        <div 
          className="properties-tabs"
          data-active-tab={activeTab}
          style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            background: 'var(--container)', 
            padding: '4px',
            borderRadius: 'var(--radius-control)',
            gap: '4px',
            flexShrink: 0,
          }}
        >
          <span className="properties-tab-indicator" aria-hidden="true" />
          <button
            className={activeTab === 'properties' ? 'selected' : ''}
            style={{ height: '32px', fontSize: '12px', fontWeight: 600, borderRadius: '6px' }}
            onClick={() => setActiveTab('properties')}
          >
            Properties
          </button>
          <button
            className={activeTab === 'review' ? 'selected' : ''}
            style={{ 
              height: '32px', 
              fontSize: '12px', 
              fontWeight: 600, 
              borderRadius: '6px',
              display: 'flex',
              gap: '6px'
            }}
            onClick={() => setActiveTab('review')}
          >
            <span>Review</span>
            {findings.length > 0 && (
              <span 
                style={{ 
                  background: activeTab === 'review' ? 'var(--surface)' : 'var(--container-hover)',
                  color: activeTab === 'review' ? 'var(--text)' : 'var(--text)',
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '6px' 
                }}
              >
                {findings.length}
              </span>
            )}
          </button>
        </div>
      ) : (
        <div style={{ paddingBottom: '4px', flexShrink: 0 }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
            Properties
          </h2>
        </div>
      )}

      {/* Review Tab Content in Corporate Mode */}
      {isCorporate && activeTab === 'review' ? (
        <ReviewPanel
          design={design}
          findings={findings}
          onApplyFix={onApplyFix}
          onApplyAllFixes={onApplyAllFixes}
          onOpenStylePicker={onOpenStylePicker}
          onRequestCloudCritique={onRequestCloudCritique}
          cloudReviewAvailable={cloudReviewAvailable}
        />
      ) : (
        /* Properties Tab Content */
        <div 
          className="properties-scroll"
          style={{ 
            flex: 1, 
            overflowY: 'auto', 
            overflowX: 'hidden',
            display: 'flex', 
            flexDirection: 'column', 
            gap: '8px',
            paddingRight: '2px',
          }}
        >
          {!selectedLayer ? (
            /* Artboard Settings when no layer selected */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Artboard Canvas
              </div>

              <div className="accordion-item">
                <div className="accordion-header" onClick={() => toggleSection('canvas')}>
                  <span>Dimensions & Background</span>
                  {openSections.canvas !== false ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                <div className="accordion-body">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Width</span>
                      <input 
                        type="number" 
                        value={design.width} 
                          onChange={(e) => onUpdateDesign({ width: Math.max(100, parseNumber(e.target.value, design.width)) })}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Height</span>
                      <input 
                        type="number" 
                        value={design.height} 
                          onChange={(e) => onUpdateDesign({ height: Math.max(100, parseNumber(e.target.value, design.height)) })}
                      />
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Canvas Surface</span>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {['#000000', '#111111', '#2C2C2C'].map((c) => (
                        <div
                          key={c}
                          onClick={() => onUpdateDesign({ background: c })}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '6px',
                            background: c,
                            cursor: 'pointer',
                            outline: design.background === c ? '2px solid #FFFFFF' : 'none',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Selected Layer Properties */
            <>
              {/* SECTION: POSITION & SIZE */}
              <div className="accordion-item">
                <div className="accordion-header" onClick={() => toggleSection('transform')}>
                  <span>Position & Size</span>
                  {openSections.transform ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                {openSections.transform && (
                  <div className="accordion-body">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>X</span>
                        <input 
                          type="number" 
                          value={selectedLayer.x} 
                          onChange={(e) => handleLayerPropChange('x', parseNumber(e.target.value, selectedLayer.x))}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Y</span>
                        <input 
                          type="number" 
                          value={selectedLayer.y} 
                          onChange={(e) => handleLayerPropChange('y', parseNumber(e.target.value, selectedLayer.y))}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Width</span>
                        <input 
                          type="number" 
                          value={selectedLayer.width} 
                          onChange={(e) => handleLayerPropChange('width', Math.max(1, parseNumber(e.target.value, selectedLayer.width)))}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Height</span>
                        <input 
                          type="number" 
                          value={selectedLayer.height} 
                          onChange={(e) => handleLayerPropChange('height', Math.max(1, parseNumber(e.target.value, selectedLayer.height)))}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: ROTATION */}
              <div className="accordion-item">
                <div className="accordion-header" onClick={() => toggleSection('rotation')}>
                  <span>Rotation</span>
                  {openSections.rotation ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                {openSections.rotation && (
                  <div className="accordion-body">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <input 
                        type="range" 
                        min="0" 
                        max="360" 
                        value={selectedLayer.rotation || 0} 
                        onChange={(e) => handleLayerPropChange('rotation', parseNumber(e.target.value, selectedLayer.rotation || 0))}
                        style={{ flex: 1, padding: 0 }}
                      />
                      <span style={{ fontSize: '12px', width: '38px', fontFamily: 'var(--font-mono)' }}>
                        {selectedLayer.rotation || 0}°
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: ALIGNMENT */}
              <div className="accordion-item">
                <div className="accordion-header" onClick={() => toggleSection('alignment')}>
                  <span>Alignment</span>
                  {openSections.alignment ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                {openSections.alignment && (
                  <div className="accordion-body">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                      <button
                        style={{ height: '32px', fontSize: '11px', borderRadius: '6px' }}
                        onClick={() => handleLayerPropChange('x', 32)}
                        title="Align Left"
                      >
                        Left
                      </button>
                      <button
                        style={{ height: '32px', fontSize: '11px', borderRadius: '6px' }}
                        onClick={() => handleLayerPropChange('x', Math.round((design.width - selectedLayer.width) / 2))}
                        title="Align Center"
                      >
                        Center
                      </button>
                      <button
                        style={{ height: '32px', fontSize: '11px', borderRadius: '6px' }}
                        onClick={() => handleLayerPropChange('x', design.width - selectedLayer.width - 32)}
                        title="Align Right"
                      >
                        Right
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                      <button
                        style={{ height: '32px', fontSize: '11px', borderRadius: '6px' }}
                        onClick={() => handleLayerPropChange('y', 32)}
                        title="Align Top"
                      >
                        Top
                      </button>
                      <button
                        style={{ height: '32px', fontSize: '11px', borderRadius: '6px' }}
                        onClick={() => handleLayerPropChange('y', Math.round((design.height - selectedLayer.height) / 2))}
                        title="Align Middle"
                      >
                        Middle
                      </button>
                      <button
                        style={{ height: '32px', fontSize: '11px', borderRadius: '6px' }}
                        onClick={() => handleLayerPropChange('y', design.height - selectedLayer.height - 32)}
                        title="Align Bottom"
                      >
                        Bottom
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: TYPOGRAPHY (if text layer) */}
              {selectedLayer.type === 'text' && (
                <div className="accordion-item">
                  <div className="accordion-header" onClick={() => toggleSection('typography')}>
                    <span>Typography</span>
                    {openSections.typography ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                  {openSections.typography && (
                    <div className="accordion-body">
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Text Content</span>
                        <textarea
                          rows={2}
                          value={selectedLayer.text || ''}
                          onChange={(e) => handleLayerPropChange('text', e.target.value)}
                        />
                      </div>

                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Typeface</span>
                        <select
                          value={selectedLayer.fontFamily || 'Lufga'}
                          onChange={(e) => handleLayerPropChange('fontFamily', e.target.value)}
                        >
                          <option value="Lufga">Lufga</option>
                          <option value="JetBrains Mono">JetBrains Mono</option>
                          <option value="Georgia">Georgia (Serif)</option>
                          <option value="sans-serif">System Sans</option>
                        </select>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Size</span>
                          <input 
                            type="number" 
                            min="8" 
                            max="240" 
                            value={selectedLayer.fontSize || 16}
                            onChange={(e) => handleLayerPropChange('fontSize', parseNumber(e.target.value, selectedLayer.fontSize || 16))}
                          />
                        </div>
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Weight</span>
                          <select
                            value={selectedLayer.fontWeight || '400'}
                            onChange={(e) => handleLayerPropChange('fontWeight', e.target.value)}
                          >
                            <option value="400">Regular (400)</option>
                            <option value="500">Medium (500)</option>
                            <option value="600">SemiBold (600)</option>
                            <option value="700">Bold (700)</option>
                            <option value="800">ExtraBold (800)</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                        <button
                          className={selectedLayer.textAlign === 'left' ? 'selected' : ''}
                          style={{ height: '32px', borderRadius: '6px' }}
                          onClick={() => handleLayerPropChange('textAlign', 'left')}
                        >
                          <AlignLeft size={14} />
                        </button>
                        <button
                          className={selectedLayer.textAlign === 'center' ? 'selected' : ''}
                          style={{ height: '32px', borderRadius: '6px' }}
                          onClick={() => handleLayerPropChange('textAlign', 'center')}
                        >
                          <AlignCenter size={14} />
                        </button>
                        <button
                          className={selectedLayer.textAlign === 'right' ? 'selected' : ''}
                          style={{ height: '32px', borderRadius: '6px' }}
                          onClick={() => handleLayerPropChange('textAlign', 'right')}
                        >
                          <AlignRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION: COLOR & FILL */}
              <div className="accordion-item">
                <div className="accordion-header" onClick={() => toggleSection('color')}>
                  <span>Color</span>
                  {openSections.color ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                {openSections.color && (
                  <div className="accordion-body">
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Fill Color</span>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        {MONO_SWATCHES.map((swatch) => (
                          <div
                            key={swatch}
                            onClick={() => handleLayerPropChange('fill', swatch)}
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '6px',
                              background: swatch,
                              cursor: 'pointer',
                              outline: selectedLayer.fill === swatch ? '2px solid #FFFFFF' : 'none',
                            }}
                          />
                        ))}
                      </div>
                      <input 
                        type="text" 
                        value={selectedLayer.fill} 
                        onChange={(e) => handleLayerPropChange('fill', e.target.value)}
                        placeholder="#FFFFFF"
                      />
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Opacity</span>
                        <span style={{ fontSize: '11px', color: 'var(--text)' }}>{Math.round((selectedLayer.opacity ?? 1) * 100)}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="1" 
                        step="0.05"
                        value={selectedLayer.opacity ?? 1}
                          onChange={(e) => handleLayerPropChange('opacity', parseNumber(e.target.value, selectedLayer.opacity ?? 1))}
                        style={{ padding: 0 }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: EFFECTS (Corner Radius, Stroke) */}
              <div className="accordion-item">
                <div className="accordion-header" onClick={() => toggleSection('effects')}>
                  <span>Effects</span>
                  {openSections.effects ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>
                {openSections.effects && (
                  <div className="accordion-body">
                    {selectedLayer.type === 'rect' && (
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Corner Radius</span>
                        <input 
                          type="number" 
                          min="0" 
                          max="200" 
                          value={selectedLayer.borderRadius || 0}
                          onChange={(e) => handleLayerPropChange('borderRadius', parseNumber(e.target.value, selectedLayer.borderRadius || 0))}
                        />
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Stroke Width</span>
                        <input 
                          type="number" 
                          min="0" 
                          max="40" 
                          value={selectedLayer.strokeWidth || 0}
                          onChange={(e) => handleLayerPropChange('strokeWidth', parseNumber(e.target.value, selectedLayer.strokeWidth || 0))}
                        />
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Stroke Color</span>
                        <input 
                          type="text" 
                          value={selectedLayer.stroke || ''}
                          onChange={(e) => handleLayerPropChange('stroke', e.target.value)}
                          placeholder="#FFFFFF"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
};

