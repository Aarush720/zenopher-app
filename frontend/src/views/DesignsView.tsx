import React, { useState } from 'react';
import { 
  Plus, 
  MoreVertical, 
  Play, 
  Edit3, 
  Copy, 
  Download, 
  Trash2,
  FolderKanban,
  Layers
} from 'lucide-react';
import { Design } from '../types';

interface DesignsViewProps {
  designs: Design[];
  searchQuery: string;
  onOpenDesign: (design: Design, sourceRect?: DOMRect) => void;
  onNewDesign: () => void;
  onDeleteDesign: (id: string) => void;
  onDuplicateDesign: (design: Design) => void;
  onRenameDesign: (design: Design) => void;
  onExportDesign: (design: Design) => void;
  loadingDesignId?: string | null;
}

export const DesignsView: React.FC<DesignsViewProps> = ({
  designs,
  searchQuery,
  onOpenDesign,
  onNewDesign,
  onDeleteDesign,
  onDuplicateDesign,
  onRenameDesign,
  onExportDesign,
  loadingDesignId,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'creative' | 'corporate'>('all');
  const [sortBy, setSortBy] = useState<'updated' | 'title'>('updated');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const filteredDesigns = designs
    .filter((d) => !d.isDeleted)
    .filter((d) => !searchQuery.trim() || d.title.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .filter((d) => {
      if (filterMode === 'all') return true;
      return d.mode === filterMode;
    })
    .sort((a, b) => {
      if (sortBy === 'title') return a.title.localeCompare(b.title);
      return b.updatedAt - a.updatedAt;
    });

  const renderCardArtwork = (design: Design) => {
    if (design.id === 'design-zen-brand') {
      return (
        <svg viewBox="0 0 400 275" style={{ width: '100%', height: '100%' }}>
          <rect width="100%" height="100%" fill="#0A0A0A" />
          <circle cx="200" cy="120" r="68" fill="#141414" stroke="#2E2E2E" strokeWidth="2" />
          <circle cx="200" cy="120" r="48" fill="#1A1A1A" stroke="#444444" strokeWidth="2" />
          <rect x="130" y="70" width="140" height="100" rx="14" fill="none" stroke="#FFFFFF" strokeWidth="2" opacity="0.85" />
          <text x="200" y="224" fill="#FFFFFF" fontSize="16" fontFamily="var(--font-sans)" fontWeight="800" textAnchor="middle" letterSpacing="4">
            PRECISION
          </text>
        </svg>
      );
    }

    if (design.id === 'design-slide-deck') {
      return (
        <svg viewBox="0 0 400 275" style={{ width: '100%', height: '100%' }}>
          <rect width="100%" height="100%" fill="#080808" />
          <rect x="40" y="44" width="96" height="150" rx="10" fill="#151515" stroke="#252525" strokeWidth="1.5" />
          <rect x="152" y="44" width="96" height="150" rx="10" fill="#1C1C1C" stroke="#333333" strokeWidth="1.5" />
          <rect x="264" y="44" width="96" height="150" rx="10" fill="#262626" stroke="#444444" strokeWidth="1.5" />
          <text x="200" y="228" fill="#FFFFFF" fontSize="13" fontFamily="var(--font-sans)" fontWeight="700" textAnchor="middle">
            Geometric Coherence
          </text>
        </svg>
      );
    }

    if (design.id === 'design-creative-sketch') {
      return (
        <svg viewBox="0 0 400 275" style={{ width: '100%', height: '100%' }}>
          <rect width="100%" height="100%" fill="#0A0A0A" />
          <text x="50" y="145" fill="#FFFFFF" fontSize="88" fontFamily="var(--font-sans)" fontWeight="800" letterSpacing="-2">
            Lufga
          </text>
          <text x="52" y="210" fill="#888888" fontSize="11" fontFamily="var(--font-sans)">
            Subtle humanist precision • Highly legible
          </text>
        </svg>
      );
    }

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
          padding: '24px',
          textAlign: 'center',
          gap: '8px',
        }}
      >
        <Layers size={36} color="var(--text-secondary)" style={{ opacity: 0.8 }} />
        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text)', maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {textLayer?.text || design.title}
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {design.width} × {design.height} px
        </span>
      </div>
    );
  };

  return (
    <div className="workspace" style={{ gridTemplateColumns: '1fr' }}>
      <section 
        className="floating-panel"
        style={{
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          overflowY: 'auto',
          height: '100%',
        }}
      >
        {/* Top Control Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text)' }}>
              All Designs
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              {filteredDesigns.length} {filteredDesigns.length === 1 ? 'project' : 'projects'} saved locally on this device
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Mode Filter */}
            <div style={{ display: 'flex', background: 'var(--container)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
              <button
                className={filterMode === 'all' ? 'selected' : ''}
                style={{ height: '32px', padding: '0 12px', fontSize: '12px', borderRadius: '6px' }}
                onClick={() => setFilterMode('all')}
              >
                All
              </button>
              <button
                className={filterMode === 'creative' ? 'selected' : ''}
                style={{ height: '32px', padding: '0 12px', fontSize: '12px', borderRadius: '6px' }}
                onClick={() => setFilterMode('creative')}
              >
                Creative
              </button>
              <button
                className={filterMode === 'corporate' ? 'selected' : ''}
                style={{ height: '32px', padding: '0 12px', fontSize: '12px', borderRadius: '6px' }}
                onClick={() => setFilterMode('corporate')}
              >
                Corporate
              </button>
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{ width: '140px', height: '36px', fontSize: '12px', padding: '0 10px' }}
            >
              <option value="updated">Recently Edited</option>
              <option value="title">Alphabetical</option>
            </select>

            <button
              className="primary"
              style={{ height: '36px', padding: '0 16px', fontSize: '12px', fontWeight: 700, borderRadius: '6px', gap: '6px' }}
              onClick={onNewDesign}
            >
              <Plus size={15} />
              <span>New</span>
            </button>
          </div>
        </div>

        {/* Large Showcase Cards Grid */}
        {filteredDesigns.length === 0 ? (
          <div 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              height: '300px',
              color: 'var(--text-muted)',
              gap: '12px',
            }}
          >
            <FolderKanban size={40} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: '14px', fontWeight: 600 }}>No designs found</span>
            <button
              className="primary"
              style={{ height: '38px', padding: '0 16px', fontSize: '12px', borderRadius: '6px' }}
              onClick={onNewDesign}
            >
              Create your first design
            </button>
          </div>
        ) : (
          <div className="grid-cards">
            {filteredDesigns.map((design) => (
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
                      top: '10px',
                      right: '10px',
                      background: 'rgba(0,0,0,0.7)',
                      color: 'var(--text)',
                      borderRadius: '6px',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuId(activeMenuId === design.id ? null : design.id);
                    }}
                    aria-label="Options"
                  >
                    <MoreVertical size={14} />
                  </button>

                  {activeMenuId === design.id && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '44px',
                        right: '10px',
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
                          setActiveMenuId(null);
                          onOpenDesign(design);
                        }}
                      >
                        <Play size={12} />
                        <span>Open</span>
                      </button>
                      <button
                        style={{ height: '30px', justifyContent: 'flex-start', padding: '0 10px', fontSize: '12px', borderRadius: '6px', gap: '8px' }}
                        onClick={() => {
                          setActiveMenuId(null);
                          onRenameDesign(design);
                        }}
                      >
                        <Edit3 size={12} />
                        <span>Rename</span>
                      </button>
                      <button
                        style={{ height: '30px', justifyContent: 'flex-start', padding: '0 10px', fontSize: '12px', borderRadius: '6px', gap: '8px' }}
                        onClick={() => {
                          setActiveMenuId(null);
                          onDuplicateDesign(design);
                        }}
                      >
                        <Copy size={12} />
                        <span>Duplicate</span>
                      </button>
                      <button
                        style={{ height: '30px', justifyContent: 'flex-start', padding: '0 10px', fontSize: '12px', borderRadius: '6px', gap: '8px' }}
                        onClick={() => {
                          setActiveMenuId(null);
                          onExportDesign(design);
                        }}
                      >
                        <Download size={12} />
                        <span>Export .zph</span>
                      </button>
                      <button
                        style={{ height: '30px', justifyContent: 'flex-start', padding: '0 10px', fontSize: '12px', borderRadius: '6px', gap: '8px', color: '#FF6B6B' }}
                        onClick={() => {
                          setActiveMenuId(null);
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
                    {design.mode === 'corporate' ? 'Corporate' : 'Creative'} • {new Date(design.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
