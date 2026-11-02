import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, Check, X } from 'lucide-react';
import { PresetSize, DesignMode, StyleProfile, Unit } from '../types';
import { PRESET_SIZES } from '../data/presets';
import { STYLE_PROFILES } from '../data/styles';

interface NewDesignModalProps {
  isOpen: boolean;
  initialPreset?: PresetSize | null;
  defaultMode?: DesignMode;
  defaultStyle?: string;
  onClose: () => void;
  onCreateDesign: (data: {
    title: string;
    width: number;
    height: number;
    unit: Unit;
    mode: DesignMode;
    styleId?: string;
  }) => void;
}

type Step = 'size' | 'mode' | 'style';

export const NewDesignModal: React.FC<NewDesignModalProps> = ({
  isOpen,
  initialPreset,
  defaultMode = 'creative',
  defaultStyle = '',
  onClose,
  onCreateDesign,
}) => {
  const [step, setStep] = useState<Step>('size');
  const [selectedPreset, setSelectedPreset] = useState<PresetSize | null>(null);
  
  // Custom size form fields
  const [customWidth, setCustomWidth] = useState<number>(1080);
  const [customHeight, setCustomHeight] = useState<number>(1080);
  const [customUnit, setCustomUnit] = useState<Unit>('px');

  // Mode selection state
  const [selectedMode, setSelectedMode] = useState<DesignMode>(defaultMode);

  // Style selection state
  const [selectedStyleId, setSelectedStyleId] = useState<string>(defaultStyle);

  const modalRef = useRef<HTMLDivElement>(null);

  // Initialize step when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialPreset) {
        setSelectedPreset(initialPreset);
        // A preset starts at Choose mode because size is already chosen
        setStep('mode');
      } else {
        setSelectedPreset(null);
        setStep('size');
      }
      setSelectedMode(defaultMode);
      setSelectedStyleId(defaultStyle);
    }
  }, [isOpen, initialPreset, defaultMode, defaultStyle]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Resolve final canvas dimensions
  const getDimensions = (): { width: number; height: number; unit: Unit; name: string } => {
    if (selectedPreset?.category === 'custom') {
      const width = Math.min(10000, Math.max(100, Number(customWidth) || 1080));
      const height = Math.min(10000, Math.max(100, Number(customHeight) || 1080));
      return {
        width,
        height,
        unit: customUnit,
        name: `Custom (${width}×${height} ${customUnit})`,
      };
    }
    if (selectedPreset) {
      return {
        width: selectedPreset.width,
        height: selectedPreset.height,
        unit: selectedPreset.unit,
        name: selectedPreset.name,
      };
    }
    return { width: 1080, height: 1080, unit: 'px', name: 'Untitled Design' };
  };

  const handleFinishCreation = (styleId?: string) => {
    const dims = getDimensions();
    onCreateDesign({
      title: `${dims.name}`,
      width: dims.width,
      height: dims.height,
      unit: dims.unit,
      mode: selectedMode,
      styleId: styleId || undefined,
    });
    onClose();
  };

  const handleContinueFromSize = () => {
    if (!selectedPreset) return;
    setStep('mode');
  };

  const handleContinueFromMode = () => {
    if (selectedMode === 'creative') {
      // Per spec: Creative -> Editor. Style is not asked for.
      handleFinishCreation(undefined);
    } else {
      // Corporate -> Style (skippable)
      setStep('style');
    }
  };

  return (
    <div 
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="modal" 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {step !== 'size' && !initialPreset && (
              <button
                className="btn-square"
                style={{ width: '36px', height: '36px' }}
                onClick={() => {
                  if (step === 'style') setStep('mode');
                  else if (step === 'mode') setStep('size');
                }}
                aria-label="Back"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <h2 id="modal-title" style={{ fontSize: '18px', fontWeight: 700 }}>
              {step === 'size' && 'Choose size'}
              {step === 'mode' && 'Choose mode'}
              {step === 'style' && 'Choose style'}
            </h2>
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

        {/* Modal Body */}
        <div className="modal-body">
          {/* STEP 1: CHOOSE SIZE */}
          {step === 'size' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Select a standard canvas format preset or specify custom artboard dimensions.
              </p>

              <div className="grid-3">
                {PRESET_SIZES.map((preset) => {
                  const isSelected = selectedPreset?.id === preset.id;
                  return (
                    <div key={preset.id} className="tile-container">
                      <div
                        className={`tile ${isSelected ? 'selected' : ''}`}
                        onClick={() => setSelectedPreset(preset)}
                      >
                        <div 
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            color: isSelected ? 'var(--surface)' : 'var(--text-secondary)',
                          }}
                        >
                          {preset.category === 'custom' ? 'Custom' : `${preset.width} × ${preset.height}`}
                        </div>
                      </div>
                      <div className="tile-meta-title" style={{ textAlign: 'center' }}>{preset.name}</div>
                    </div>
                  );
                })}
              </div>

              {/* Custom Size Inputs */}
              {selectedPreset?.category === 'custom' && (
                <div
                  className="custom-size-grid"
                  style={{
                    background: 'var(--container)', 
                    borderRadius: 'var(--radius-section)', 
                    padding: '16px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 100px',
                    gap: '12px',
                    marginTop: '8px',
                  }}
                >
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                      Width
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="10000"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(Math.min(10000, Math.max(100, Number(e.target.value) || 100)))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                      Height
                    </label>
                    <input
                      type="number"
                      min="100"
                      max="10000"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(Math.min(10000, Math.max(100, Number(e.target.value) || 100)))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                      Unit
                    </label>
                    <select
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value as Unit)}
                    >
                      <option value="px">px</option>
                      <option value="mm">mm</option>
                      <option value="in">in</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: CHOOSE MODE */}
          {step === 'mode' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Page size: {getDimensions().name}
              </div>

              <div
                className="mode-options"
                style={{
                  display: 'grid', 
                  gridTemplateColumns: '1fr 1fr', 
                  gap: '14px' 
                }}
                role="radiogroup"
                aria-label="Design Mode"
              >
                {/* Creative Option */}
                <div
                  role="radio"
                  aria-checked={selectedMode === 'creative'}
                  tabIndex={0}
                  onClick={() => setSelectedMode('creative')}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') setSelectedMode('creative');
                  }}
                  style={{
                    background: selectedMode === 'creative' ? 'var(--ui-selected)' : 'var(--container)',
                    color: selectedMode === 'creative' ? 'var(--ui-selected-text)' : 'var(--text)',
                    borderRadius: 'var(--radius-section)',
                    padding: '24px 20px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    transition: 'background var(--motion), color var(--motion)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '18px', fontWeight: 800 }}>Creative</span>
                    <div 
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: selectedMode === 'creative' ? '6px solid var(--surface)' : '2px solid rgba(255,255,255,0.4)',
                        background: 'transparent',
                      }}
                    />
                  </div>
                  <p 
                    style={{ 
                      fontSize: '13px', 
                      color: selectedMode === 'creative' ? 'rgba(0,0,0,0.75)' : 'var(--text-secondary)',
                      lineHeight: 1.4,
                    }}
                  >
                    Design freely. No help or checks.
                  </p>
                </div>

                {/* Corporate Option */}
                <div
                  role="radio"
                  aria-checked={selectedMode === 'corporate'}
                  tabIndex={0}
                  onClick={() => setSelectedMode('corporate')}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') setSelectedMode('corporate');
                  }}
                  style={{
                    background: selectedMode === 'corporate' ? 'var(--ui-selected)' : 'var(--container)',
                    color: selectedMode === 'corporate' ? 'var(--ui-selected-text)' : 'var(--text)',
                    borderRadius: 'var(--radius-section)',
                    padding: '24px 20px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    transition: 'background var(--motion), color var(--motion)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '18px', fontWeight: 800 }}>Corporate</span>
                    <div 
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: selectedMode === 'corporate' ? '6px solid var(--surface)' : '2px solid rgba(255,255,255,0.4)',
                        background: 'transparent',
                      }}
                    />
                  </div>
                  <p 
                    style={{ 
                      fontSize: '13px', 
                      color: selectedMode === 'corporate' ? 'rgba(0,0,0,0.75)' : 'var(--text-secondary)',
                      lineHeight: 1.4,
                    }}
                  >
                    Checks your design as you work and explains what to fix.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: CHOOSE STYLE (CORPORATE FLOW) */}
          {step === 'style' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Select a stylistic profile to measure your design against, or skip for standard base checks.
              </p>

              <div className="grid-3">
                {STYLE_PROFILES.map((style) => {
                  const isSelected = selectedStyleId === style.id;
                  return (
                    <div 
                      key={style.id}
                      onClick={() => setSelectedStyleId(style.id)}
                      style={{
                        background: isSelected ? 'var(--container-hover)' : 'var(--container)',
                        borderRadius: 'var(--radius-tile)',
                        padding: '16px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        transition: 'background var(--motion)',
                        position: 'relative',
                      }}
                    >
                      {/* Mini Preview Box */}
                      <div 
                        style={{
                          height: '60px',
                          background: 'var(--surface)',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px',
                        }}
                      >
                        {style.palette.slice(0, 4).map((c, i) => (
                          <div 
                            key={i} 
                            style={{ 
                              width: '18px', 
                              height: '18px', 
                              borderRadius: '4px', 
                              background: c 
                            }} 
                          />
                        ))}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
                          {style.name}
                        </span>
                        {isSelected && <Check size={16} color="var(--text)" />}
                      </div>

                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                        {style.description}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Not sure? Pick a style later. The teacher waits until you do.
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="modal-footer">
          {step === 'size' && (
            <button
              className="primary"
              disabled={!selectedPreset}
              onClick={handleContinueFromSize}
              style={{
                height: '46px',
                padding: '0 24px',
                fontSize: '13px',
                borderRadius: 'var(--radius-control)',
              }}
            >
              Continue
            </button>
          )}

          {step === 'mode' && (
            <button
              className="primary"
              onClick={handleContinueFromMode}
              style={{
                height: '46px',
                padding: '0 24px',
                fontSize: '13px',
                borderRadius: 'var(--radius-control)',
              }}
            >
              {selectedMode === 'creative' ? 'Create design' : 'Continue'}
            </button>
          )}

          {step === 'style' && (
            <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'flex-end' }}>
              <button
                onClick={() => handleFinishCreation(undefined)}
                style={{ 
                  height: '46px',
                  padding: '0 20px',
                  fontSize: '13px',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-control)',
                  background: 'var(--container)',
                  color: 'var(--text)',
                }}
              >
                Skip for now
              </button>

              <button
                className="primary"
                onClick={() => handleFinishCreation(selectedStyleId || undefined)}
                style={{
                  height: '46px',
                  padding: '0 24px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-control)',
                }}
              >
                Choose style
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

