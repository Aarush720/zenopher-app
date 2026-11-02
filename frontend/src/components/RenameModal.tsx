import React, { useState, useEffect } from 'react';
import { X, Edit3 } from 'lucide-react';
import { Design } from '../types';

interface RenameModalProps {
  isOpen: boolean;
  design: Design | null;
  onClose: () => void;
  onRename: (id: string, newTitle: string) => void;
}

export const RenameModal: React.FC<RenameModalProps> = ({
  isOpen,
  design,
  onClose,
  onRename,
}) => {
  const [title, setTitle] = useState<string>('');

  useEffect(() => {
    if (design) {
      setTitle(design.title);
    }
  }, [design]);

  if (!isOpen || !design) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onRename(design.id, title.trim());
      onClose();
    }
  };

  return (
    <div 
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: '420px' }} role="dialog" aria-modal="true">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Edit3 size={18} color="var(--text)" />
            <h2 style={{ fontSize: '17px', fontWeight: 700 }}>Rename Design</h2>
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

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              Design Name
            </label>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Minimalist Poster"
            />
          </div>

          <div className="modal-footer">
            <button
              type="button"
              style={{ height: '40px', padding: '0 16px', fontSize: '12px', borderRadius: '6px', background: 'transparent' }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="primary"
              disabled={!title.trim()}
              style={{ height: '40px', padding: '0 20px', fontSize: '12px', borderRadius: '6px' }}
            >
              Save Name
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

