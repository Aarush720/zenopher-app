import React, { useEffect, useState } from 'react';
import {
  Circle,
  Frame,
  Hand,
  ImagePlus,
  MousePointer2,
  Move,
  Pencil,
  Square,
  Type,
  ZoomIn,
} from 'lucide-react';
import { LayerType } from '../../types';

type CreativeTool = 'select' | 'move' | 'text' | 'rect' | 'circle' | 'frame' | 'image' | 'hand' | 'zoom';

interface CreativeToolsPanelProps {
  onAddLayer: (type: LayerType) => void;
  onOpenFile: () => void;
}

const TOOLS: Array<{ id: CreativeTool; label: string; shortcut: string; icon: React.ReactNode }> = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: <MousePointer2 size={17} /> },
  { id: 'move', label: 'Move', shortcut: 'M', icon: <Move size={17} /> },
  { id: 'text', label: 'Text', shortcut: 'T', icon: <Type size={17} /> },
  { id: 'rect', label: 'Rectangle', shortcut: 'R', icon: <Square size={17} /> },
  { id: 'circle', label: 'Circle', shortcut: 'O', icon: <Circle size={17} /> },
  { id: 'frame', label: 'Frame', shortcut: 'F', icon: <Frame size={17} /> },
  { id: 'image', label: 'Place image', shortcut: 'I', icon: <ImagePlus size={17} /> },
  { id: 'hand', label: 'Pan canvas', shortcut: 'H', icon: <Hand size={17} /> },
  { id: 'zoom', label: 'Zoom', shortcut: 'Z', icon: <ZoomIn size={17} /> },
];

const ADD_LAYER_TOOLS = new Set<CreativeTool>(['text', 'rect', 'circle', 'frame']);

export const CreativeToolsPanel: React.FC<CreativeToolsPanelProps> = ({ onAddLayer, onOpenFile }) => {
  const [activeTool, setActiveTool] = useState<CreativeTool>('select');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const tool = TOOLS.find((item) => item.shortcut.toLowerCase() === event.key.toLowerCase());
      if (!tool) return;
      event.preventDefault();
      setActiveTool(tool.id);
      if (ADD_LAYER_TOOLS.has(tool.id)) onAddLayer(tool.id as LayerType);
      if (tool.id === 'image') onOpenFile();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onAddLayer, onOpenFile]);

  const handleToolClick = (tool: (typeof TOOLS)[number]) => {
    setActiveTool(tool.id);
    if (ADD_LAYER_TOOLS.has(tool.id)) onAddLayer(tool.id as LayerType);
    if (tool.id === 'image') onOpenFile();
  };

  return (
    <aside className="creative-tools-panel floating-panel" aria-label="Creative tools">
      <div className="creative-tools-header" aria-hidden="true">
        <Pencil size={15} />
      </div>

      <div className="creative-tools-list">
        {TOOLS.map((tool, index) => (
          <React.Fragment key={tool.id}>
            {index === 2 || index === 6 ? <span className="creative-tools-divider" aria-hidden="true" /> : null}
            <button
              type="button"
              className={`creative-tool-button${activeTool === tool.id ? ' selected' : ''}`}
              onClick={() => handleToolClick(tool)}
              title={`${tool.label} (${tool.shortcut})`}
              aria-label={`${tool.label} (${tool.shortcut})`}
            >
              {tool.icon}
              <span className="creative-tool-key">{tool.shortcut}</span>
            </button>
          </React.Fragment>
        ))}
      </div>

      <div className="creative-tools-footer">
        <span className="creative-tools-status-dot" aria-hidden="true" />
        <span>Creative</span>
      </div>
    </aside>
  );
};
