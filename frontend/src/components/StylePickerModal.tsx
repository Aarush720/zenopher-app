import React from 'react';
import { X, Check, Palette } from 'lucide-react';
import { StyleProfile } from '../types';
import { STYLE_PROFILES } from '../data/styles';

interface StylePickerModalProps {
  isOpen: boolean;
  currentStyleId?: string;
  onClose: () => void;
  onSelectStyle: (styleId?: string) => void;
}

export const StylePickerModal: React.FC<StylePickerModalProps> = ({
  isOpen,
  currentStyleId,
  onClose,
  onSelectStyle,
}) => {
  if (!isOpen) return null;

  return (
    <div 
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: '600px' }} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Palette size={18} color="var(--text)" />
            <h2 style={{ fontSize: '17px', fontWeight: 700 }}>Choose Style Profile</h2>
          </div>
          <button 
            className="btn-square" 
            style={{ width: '36px', height: '36px' }} 
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Select a style profile for the Corporate review engine to enforce typography, contrast, and layout rules.
          </p>

          {/* Remove / Detach Style Option */}
          <div
            onClick={() => {
              onSelectStyle(undefined);
              onClose();
            }}
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              background: !currentStyleId ? 'var(--container-hover)' : 'var(--container)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                No Style (Base Checks Only)
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>
                Run standard contrast, text size, alignment, and crop checks without aesthetic enforcement.
              </span>
            </div>
            {!currentStyleId && <Check size={16} color="var(--text)" />}
          </div>

          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {STYLE_PROFILES.map((style) => {
              const isSelected = currentStyleId === style.id;
              return (
                <div
                  key={style.id}
                  onClick={() => {
                    onSelectStyle(style.id);
                    onClose();
                  }}
                  style={{
                    padding: '14px',
                    borderRadius: '8px',
                    background: isSelected ? 'var(--container-hover)' : 'var(--container)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                      {style.name}
                    </span>
                    {isSelected && <Check size={16} color="var(--text)" />}
                  </div>

                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                    {style.description}
                  </p>

                  <div style={{ display: 'flex', gap: '4px', marginTop: 'auto' }}>
                    {style.palette.map((c, i) => (
                      <div key={i} style={{ width: '12px', height: '12px', borderRadius: '3px', background: c }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-footer">
          <button
            style={{ height: '38px', padding: '0 16px', fontSize: '12px', borderRadius: '10px', background: 'transparent' }}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

