import React from 'react';
import { X, Command } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: '⌘ / Ctrl + N', description: 'Create new design' },
    { key: '⌘ / Ctrl + O', description: 'Open local file (.zph, PNG, PSD, PSB)' },
    { key: '⌘ / Ctrl + S', description: 'Explicitly save design' },
    { key: '⌘ / Ctrl + E', description: 'Open export modal' },
    { key: '⌘ / Ctrl + K', description: 'Open global search' },
    { key: 'Esc', description: 'Dismiss current popup / modal' },
    { key: 'Delete / Backspace', description: 'Delete selected layer' },
    { key: 'Arrow Keys', description: 'Nudge selected layer by 1px (Shift for 10px)' },
  ];

  return (
    <div 
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: '520px' }} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Command size={18} color="var(--text)" />
            <h2 style={{ fontSize: '17px', fontWeight: 700 }}>Keyboard Shortcuts</h2>
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

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {shortcuts.map((s, i) => (
            <div 
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'var(--container)',
                borderRadius: '8px',
              }}
            >
              <span style={{ fontSize: '13px', color: 'var(--text)' }}>
                {s.description}
              </span>
              <kbd 
                style={{ 
                  background: 'var(--on-surface)',
                  color: 'var(--text-secondary)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                }}
              >
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button
            className="primary"
            style={{ height: '40px', padding: '0 20px', fontSize: '12px', borderRadius: '6px' }}
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

