import React, { useState } from 'react';
import { Palette, Plus, Check, Shield, Layers } from 'lucide-react';
import { StyleProfile } from '../types';
import { STYLE_PROFILES } from '../data/styles';

interface StylesViewProps {
  onSelectStyleForNewDesign: (style: StyleProfile) => void;
}

export const StylesView: React.FC<StylesViewProps> = ({
  onSelectStyleForNewDesign,
}) => {
  const [selectedStyle, setSelectedStyle] = useState<StyleProfile>(STYLE_PROFILES[0]);

  return (
    <div className="workspace">
      {/* Left List of Style Profiles */}
      <section 
        className="floating-panel"
        style={{
          padding: 'var(--space-panel-padding)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          overflowY: 'auto',
        }}
      >
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>
            Style Library
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Curated typographic and geometric rulesets measured by the Corporate Mode design teacher.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {STYLE_PROFILES.map((style) => {
            const isSelected = selectedStyle.id === style.id;
            return (
              <div
                key={style.id}
                onClick={() => setSelectedStyle(style)}
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-section)',
                  background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'background var(--motion)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                    {style.name}
                  </span>
                  {isSelected && <Check size={16} color="var(--text)" />}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                  {style.description}
                </p>
                {/* Palette dots */}
                <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                  {style.palette.map((c, i) => (
                    <div key={i} style={{ width: '14px', height: '14px', borderRadius: '4px', background: c }} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Right Detailed Style Profile & Specimen */}
      <section 
        className="floating-panel"
        style={{
          padding: 'var(--space-panel-padding)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text)' }}>
              {selectedStyle.name}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {selectedStyle.description}
            </p>
          </div>

          <button
            className="primary"
            style={{
              height: '42px',
              padding: '0 18px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '6px',
              gap: '6px',
            }}
            onClick={() => onSelectStyleForNewDesign(selectedStyle)}
          >
            <Plus size={16} />
            <span>Create with this style</span>
          </button>
        </div>

        {/* Specimen Card (Inspired by reference mockup typography card) */}
        <div 
          style={{
            background: 'var(--surface)',
            borderRadius: 'var(--radius-section)',
            padding: '32px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Specimen
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {selectedStyle.primaryFont}
            </span>
          </div>

          {/* Large Hero Typographic Display */}
          <div 
            style={{ 
              fontSize: '84px', 
              fontWeight: 800, 
              color: 'var(--text)',
              letterSpacing: '-3px',
              lineHeight: 1,
              fontFamily: selectedStyle.primaryFont,
            }}
          >
            Aa Bb 01
          </div>

          <p 
            style={{ 
              fontSize: '14px', 
              lineHeight: 1.6, 
              color: 'var(--text-secondary)',
              fontFamily: selectedStyle.primaryFont,
              maxWidth: '560px',
            }}
          >
            Blends geometric precision with subtle humanist details. Clean, highly legible, and quietly confident, it supports complex information hierarchies without overwhelming the visual grid.
          </p>

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            {selectedStyle.palette.map((color, idx) => (
              <div 
                key={idx} 
                style={{
                  flex: 1,
                  height: '40px',
                  borderRadius: '6px',
                  background: color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  color: color === '#FFFFFF' || color === '#F0F0F0' || color === '#E0E0E0' ? '#000000' : '#FFFFFF',
                  fontWeight: 600,
                }}
              >
                {color}
              </div>
            ))}
          </div>
        </div>

        {/* Validation Rules Card */}
        <div 
          style={{
            background: 'var(--container)',
            borderRadius: 'var(--radius-section)',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={18} color="var(--text)" />
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
              Enforced Corporate Rules
            </span>
          </div>

          <div className="grid-3">
            <div style={{ background: 'var(--on-surface)', padding: '12px 14px', borderRadius: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Contrast Threshold</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginTop: '2px', display: 'block' }}>
                ≥ {selectedStyle.rules.minContrast}:1 WCAG
              </span>
            </div>
            <div style={{ background: 'var(--on-surface)', padding: '12px 14px', borderRadius: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Min Body Font</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginTop: '2px', display: 'block' }}>
                {selectedStyle.rules.minBodyFontSize}px
              </span>
            </div>
            <div style={{ background: 'var(--on-surface)', padding: '12px 14px', borderRadius: '8px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>Boundary Inset</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', marginTop: '2px', display: 'block' }}>
                {selectedStyle.rules.defaultMargin}px Margin
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

