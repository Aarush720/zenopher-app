import React from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Plus, 
  FolderOpen, 
  Download, 
  Command,
  Share2
} from 'lucide-react';
import { NavigationDestination, Design, DesignMode } from '../types';
import GooeyNav from './GooeyNav';

interface TopBarProps {
  currentDestination: NavigationDestination;
  contextTitle: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onNewDesign: () => void;
  onOpenFile: () => void;
  activeDesign?: Design | null;
  onExport?: () => void;
  onShare?: () => void;
  onOpenShortcuts?: () => void;
  onToggleEditorMode?: (mode: DesignMode) => void;
  onOpenStylePicker?: () => void;
  saveStatus?: 'saved' | 'saving';
}

export const TopBar: React.FC<TopBarProps> = ({
  currentDestination,
  contextTitle,
  searchQuery,
  onSearchChange,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onNewDesign,
  onOpenFile,
  activeDesign,
  onExport,
  onShare,
  onOpenShortcuts,
  onToggleEditorMode,
  onOpenStylePicker,
  saveStatus = 'saved',
}) => {
  const isEditor = currentDestination === 'editor';

  return (
    <header 
      className={`floating-panel top-bar ${isEditor ? 'is-editor' : 'is-dashboard'}`}
      style={{
        height: '50px',
        minHeight: '50px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: '10px',
        zIndex: 10,
      }}
    >
      {/* Navigation history controls */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <button
          className="btn-square"
          style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px', borderRadius: '14px' }}
          onClick={onBack}
          disabled={!canGoBack}
          title="Back"
          aria-label="Back"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          className="btn-square"
          style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px', borderRadius: '14px' }}
          onClick={onForward}
          disabled={!canGoForward}
          title="Forward"
          aria-label="Forward"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Context title crossfades with the editor title instead of replacing abruptly. */}
      <div className="top-bar-title">
        <div className={`top-bar-title-state ${!isEditor ? 'is-visible' : ''}`}>
          <h1>{isEditor ? 'Home' : contextTitle}</h1>
        </div>
        <div className={`top-bar-title-state ${isEditor ? 'is-visible' : ''}`}>
          <h1>{isEditor ? contextTitle : 'Design'}</h1>
          {saveStatus && (
            <span className="top-bar-save-status">
              {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
            </span>
          )}
        </div>
      </div>

      {/* Center controls crossfade between dashboard search and editor controls. */}
      <div className="top-bar-center">
        <div className={`top-bar-center-state ${!isEditor ? 'is-visible' : ''}`}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
          <Search 
            size={14} 
            style={{ 
              position: 'absolute', 
              left: '12px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }} 
          />
          <input
            type="text"
            placeholder="Search for files or projects..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              height: '36px',
              paddingLeft: '34px',
              paddingRight: '48px',
              borderRadius: '14px',
              fontSize: '12px',
            }}
          />
          <div 
            style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              padding: '1px 5px',
              background: 'var(--container-hover)',
              borderRadius: '6px',
              color: 'var(--text-muted)',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={onOpenShortcuts}
            title="Keyboard shortcuts"
          >
            <span>⌘K</span>
          </div>
          </div>
        </div>

        <div className={`top-bar-center-state ${isEditor ? 'is-visible' : ''}`}>
          <GooeyNav
            className="editor-mode-gooey"
            items={[{ label: 'Creative' }, { label: 'Corporate' }]}
            activeIndex={activeDesign?.mode === 'corporate' ? 1 : 0}
            initialActiveIndex={0}
            theme="dark"
            size="sm"
            frame
            particleCount={8}
            spread={28}
            animationTime={520}
            timeVariance={140}
            gooeyness={0.45}
            wobble={0.35}
            hoverEffect={false}
            colors={['#f4f4f5', '#d5d5d5', '#aaaaaa']}
            onChange={(index: number) => onToggleEditorMode?.(index === 1 ? 'corporate' : 'creative')}
          />
        </div>
      </div>

      {/* Page actions crossfade without changing the top bar's rhythm. */}
      <div className="top-bar-actions">
        <div className={`top-bar-action-state ${!isEditor ? 'is-visible' : ''}`}>
            <button
              className="btn-square"
              style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px', borderRadius: '14px' }}
              onClick={onOpenFile}
              title="Open file (.zph, PNG, PSD)"
              aria-label="Open file"
            >
              <FolderOpen size={16} />
            </button>
            <button
              className="primary"
              style={{
                height: '36px',
                padding: '0 14px',
                gap: '6px',
                fontSize: '12px',
                borderRadius: '14px',
              }}
              onClick={onNewDesign}
            >
              <Plus size={15} />
              <span>New</span>
            </button>
        </div>
        <div className={`top-bar-action-state ${isEditor ? 'is-visible' : ''}`}>
            <button
              className="btn-square"
              style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px', borderRadius: '14px' }}
              onClick={onShare}
              title="Share design"
              aria-label="Share design"
            >
              <Share2 size={15} />
            </button>
            <button
              className="btn-square"
              style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px', borderRadius: '14px' }}
              onClick={onOpenShortcuts}
              title="Keyboard shortcuts"
              aria-label="Keyboard shortcuts"
            >
              <Command size={15} />
            </button>
            <button
              className="primary"
              style={{
                height: '36px',
                padding: '0 14px',
                gap: '6px',
                fontSize: '12px',
                borderRadius: '14px',
              }}
              onClick={onExport}
            >
              <Download size={15} />
              <span>Export</span>
            </button>
        </div>
      </div>
    </header>
  );
};
