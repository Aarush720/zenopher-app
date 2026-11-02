import React, { useState } from 'react';
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Trash2, 
  Type, 
  Square, 
  Circle, 
  ChevronUp, 
  ChevronDown, 
  Plus,
  Layers,
  Edit2
} from 'lucide-react';
import { Layer, LayerType } from '../../types';

interface FloatingLayersPanelProps {
  layers: Layer[];
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onUpdateLayer: (id: string, updates: Partial<Layer>) => void;
  onAddLayer: (type: LayerType) => void;
  onDeleteLayer: (id: string) => void;
  onReorderLayer: (id: string, direction: 'up' | 'down') => void;
}

export const FloatingLayersPanel: React.FC<FloatingLayersPanelProps> = ({
  layers,
  selectedLayerId,
  onSelectLayer,
  onUpdateLayer,
  onAddLayer,
  onDeleteLayer,
  onReorderLayer,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState<string>('');

  const handleStartRename = (layer: Layer) => {
    setRenamingId(layer.id);
    setRenameText(layer.name);
  };

  const handleSaveRename = (id: string) => {
    if (renameText.trim()) {
      onUpdateLayer(id, { name: renameText.trim() });
    }
    setRenamingId(null);
  };

  const getLayerIcon = (type: LayerType) => {
    switch (type) {
      case 'text': return <Type size={14} />;
      case 'circle': return <Circle size={14} />;
      default: return <Square size={14} />;
    }
  };

  return (
    <aside 
      className="floating-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px',
        gap: '12px',
        overflow: 'hidden',
      }}
    >
      {/* Panel Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={16} color="var(--text)" />
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
            Layers
          </h2>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {layers.length} {layers.length === 1 ? 'item' : 'items'}
        </span>
      </div>

      {/* Quick Add Layer Controls */}
      <div 
        style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '6px',
          background: 'var(--container)',
          padding: '4px',
          borderRadius: 'var(--radius-control)',
        }}
      >
        <button
          style={{ height: '32px', fontSize: '11px', gap: '6px', borderRadius: '6px' }}
          onClick={() => onAddLayer('text')}
          title="Add Text Layer"
        >
          <Type size={13} />
          <span>Text</span>
        </button>
        <button
          style={{ height: '32px', fontSize: '11px', gap: '6px', borderRadius: '6px' }}
          onClick={() => onAddLayer('rect')}
          title="Add Rectangle"
        >
          <Square size={13} />
          <span>Rect</span>
        </button>
        <button
          style={{ height: '32px', fontSize: '11px', gap: '6px', borderRadius: '6px' }}
          onClick={() => onAddLayer('circle')}
          title="Add Circle"
        >
          <Circle size={13} />
          <span>Circle</span>
        </button>
      </div>

      {/* Layers List (Top of stack to bottom) */}
      <div 
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '4px',
          paddingRight: '2px' 
        }}
      >
        {layers.length === 0 ? (
          <div 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center',
              height: '140px',
              color: 'var(--text-muted)',
              fontSize: '12px',
              gap: '8px'
            }}
          >
            <span>No layers yet</span>
            <span>Use the buttons above to add objects</span>
          </div>
        ) : (
          [...layers].reverse().map((layer, index) => {
            const isSelected = selectedLayerId === layer.id;
            const originalIndex = layers.length - 1 - index;
            const canMoveUp = originalIndex < layers.length - 1;
            const canMoveDown = originalIndex > 0;

            return (
              <div
                key={layer.id}
                className="layer-row"
                onClick={() => onSelectLayer(layer.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-control)',
                  background: isSelected ? 'var(--container)' : 'transparent',
                  color: isSelected ? 'var(--text)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  gap: '8px',
                  transition: 'background var(--motion)',
                }}
              >
                {/* Type Icon */}
                <div style={{ opacity: layer.visible ? 1 : 0.4 }}>
                  {getLayerIcon(layer.type)}
                </div>

                {/* Layer Name or Inline Rename */}
                <div style={{ flex: 1, minWidth: 0, opacity: layer.visible ? 1 : 0.4 }}>
                  {renamingId === layer.id ? (
                    <input
                      type="text"
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      onBlur={() => handleSaveRename(layer.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(layer.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      style={{
                        height: '24px',
                        padding: '2px 6px',
                        fontSize: '12px',
                        background: 'var(--container-hover)',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div 
                      onDoubleClick={() => handleStartRename(layer)}
                      style={{
                        fontSize: '12px',
                        fontWeight: isSelected ? 600 : 400,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {layer.name}
                    </div>
                  )}
                </div>

                {/* Layer Quick Controls */}
                <div 
                  style={{ display: 'flex', alignItems: 'center', gap: '2px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Reorder Buttons */}
                  <button
                    style={{ width: '22px', height: '22px', background: 'transparent' }}
                    disabled={!canMoveUp}
                    onClick={() => onReorderLayer(layer.id, 'up')}
                    title="Bring Forward"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    style={{ width: '22px', height: '22px', background: 'transparent' }}
                    disabled={!canMoveDown}
                    onClick={() => onReorderLayer(layer.id, 'down')}
                    title="Send Backward"
                  >
                    <ChevronDown size={12} />
                  </button>

                  {/* Lock Toggle */}
                  <button
                    style={{ width: '22px', height: '22px', background: 'transparent' }}
                    onClick={() => onUpdateLayer(layer.id, { locked: !layer.locked })}
                    title={layer.locked ? 'Unlock' : 'Lock'}
                  >
                    {layer.locked ? <Lock size={12} /> : <Unlock size={12} style={{ opacity: 0.4 }} />}
                  </button>

                  {/* Visibility Toggle */}
                  <button
                    style={{ width: '22px', height: '22px', background: 'transparent' }}
                    onClick={() => onUpdateLayer(layer.id, { visible: !layer.visible })}
                    title={layer.visible ? 'Hide' : 'Show'}
                  >
                    {layer.visible ? <Eye size={12} /> : <EyeOff size={12} style={{ opacity: 0.4 }} />}
                  </button>

                  {/* Delete Layer */}
                  <button
                    style={{ width: '22px', height: '22px', background: 'transparent', color: '#FF7B7B' }}
                    onClick={() => onDeleteLayer(layer.id)}
                    title="Delete Layer"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

