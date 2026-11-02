import React from 'react';
import { X, Trash2, AlertTriangle } from 'lucide-react';
import { Design } from '../types';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  design: Design | null;
  onClose: () => void;
  onConfirm: (id: string) => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  design,
  onClose,
  onConfirm,
}) => {
  if (!isOpen || !design) return null;

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
            <Trash2 size={18} color="#FF7B7B" />
            <h2 style={{ fontSize: '17px', fontWeight: 700 }}>Move to Trash</h2>
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
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Are you sure you want to move <strong style={{ color: 'var(--text)' }}>"{design.title}"</strong> to the Trash?
          </p>
          <div 
            style={{ 
              background: 'var(--container)', 
              borderRadius: '8px', 
              padding: '12px 14px',
              fontSize: '11px',
              color: 'var(--text-muted)',
              lineHeight: 1.4,
            }}
          >
            Deleted designs are kept in Trash for 30 days before permanent removal. You can restore it at any time.
          </div>
        </div>

        <div className="modal-footer">
          <button
            style={{ height: '40px', padding: '0 16px', fontSize: '12px', borderRadius: '6px', background: 'transparent' }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            style={{
              height: '40px',
              padding: '0 20px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '6px',
              background: '#D32F2F',
              color: '#FFFFFF',
            }}
            onClick={() => {
              onConfirm(design.id);
              onClose();
            }}
          >
            Move to Trash
          </button>
        </div>
      </div>
    </div>
  );
};

