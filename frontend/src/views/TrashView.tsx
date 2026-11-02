import React, { useState } from 'react';
import { Trash2, RotateCcw, FolderKanban } from 'lucide-react';
import { Design } from '../types';

interface TrashViewProps {
  trashDesigns: Design[];
  onRestore: (id: string) => void;
  onDeletePermanently: (id: string) => void;
  onEmptyTrash: () => void;
}

export const TrashView: React.FC<TrashViewProps> = ({
  trashDesigns,
  onRestore,
  onDeletePermanently,
  onEmptyTrash,
}) => {
  const [confirmEmpty, setConfirmEmpty] = useState<boolean>(false);

  const getDaysRemaining = (deletedAt?: number) => {
    if (!deletedAt) return 30;
    const elapsedDays = Math.floor((Date.now() - deletedAt) / (1000 * 3600 * 24));
    return Math.max(0, 30 - elapsedDays);
  };

  return (
    <div className="workspace" style={{ gridTemplateColumns: '1fr' }}>
      <section 
        className="floating-panel"
        style={{
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0',
          overflowY: 'auto',
          height: '100%',
        }}
      >
        <div className="gallery-section trash-section">
        <div className="gallery-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)' }}>
              Trash
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Items are kept for 30 days before permanent automatic removal.
            </p>
          </div>

          {trashDesigns.length > 0 && (
            <div>
              {confirmEmpty ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#FF7B7B', fontWeight: 600 }}>Delete all permanently?</span>
                  <button
                    style={{ height: '30px', padding: '0 10px', fontSize: '11px', background: '#D32F2F', color: '#FFFFFF', borderRadius: '6px' }}
                    onClick={() => {
                      onEmptyTrash();
                      setConfirmEmpty(false);
                    }}
                  >
                    Confirm Empty
                  </button>
                  <button
                    style={{ height: '30px', padding: '0 10px', fontSize: '11px', borderRadius: '6px' }}
                    onClick={() => setConfirmEmpty(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  style={{
                    height: '32px',
                    padding: '0 12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    gap: '6px',
                    background: 'var(--container)',
                    color: '#FF7B7B',
                  }}
                  onClick={() => setConfirmEmpty(true)}
                >
                  <Trash2 size={13} />
                  <span>Empty Trash</span>
                </button>
              )}
            </div>
          )}
        </div>

        {trashDesigns.length === 0 ? (
          <div 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              height: '240px',
              color: 'var(--text-muted)',
              gap: '10px',
            }}
          >
            <Trash2 size={32} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Trash is empty</span>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Deleted designs will appear here before permanent deletion.
            </p>
          </div>
        ) : (
          <div className="trash-grid">
            {trashDesigns.map((design) => {
              const daysLeft = getDaysRemaining(design.deletedAt);

              return (
                <div key={design.id} className="design-card trash-card">
                  <div className="design-card-preview">
                    <div 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        background: design.background || '#111111',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '20px',
                        opacity: 0.65,
                      }}
                    >
                      <FolderKanban size={22} color="var(--text-muted)" style={{ marginBottom: '4px' }} />
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {design.width} × {design.height} px
                      </span>
                    </div>

                    {/* Countdown Badge */}
                    <div
                      className="trash-countdown"
                      style={{
                        position: 'absolute',
                        top: '6px',
                        left: '6px',
                        background: 'rgba(0,0,0,0.75)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontWeight: 600,
                        color: daysLeft < 5 ? '#FF7B7B' : 'var(--text-secondary)',
                      }}
                    >
                      {daysLeft}d left
                    </div>

                    {/* Quick Restore & Delete Permanently */}
                    <div
                      className="trash-card-actions"
                      style={{
                        position: 'absolute',
                        bottom: '6px',
                        right: '6px',
                        display: 'flex',
                        gap: '4px',
                      }}
                    >
                      <button
                        className="btn-square-sm"
                        style={{ width: '26px', height: '26px', minWidth: '26px', minHeight: '26px', borderRadius: '6px', background: 'var(--ui-selected)', color: 'var(--ui-selected-text)' }}
                        onClick={() => onRestore(design.id)}
                        title="Restore design"
                      >
                        <RotateCcw size={12} />
                      </button>
                      <button
                        className="btn-square-sm"
                        style={{ width: '26px', height: '26px', minWidth: '26px', minHeight: '26px', borderRadius: '6px', background: '#3A1E1E', color: '#FF7B7B' }}
                        onClick={() => onDeletePermanently(design.id)}
                        title="Delete permanently"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="design-card-info">
                    <div className="design-card-title">{design.title}</div>
                    <div className="design-card-subtitle">
                      Deleted {design.deletedAt ? new Date(design.deletedAt).toLocaleDateString() : 'recently'} · {daysLeft}d left
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </section>
    </div>
  );
};
