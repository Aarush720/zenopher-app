import React from 'react';
import { 
  Clock, 
  LayoutGrid, 
  LayoutTemplate, 
  Trash2, 
  FolderOpen,
  BookOpen, 
  Palette, 
  Settings, 
  HelpCircle, 
  User,
  Shield,
  FileText,
  ChevronDown,
  Bell,
} from 'lucide-react';
import { NavigationDestination } from '../types';

interface NavigationRailProps {
  currentDestination: NavigationDestination;
  onNavigate: (dest: NavigationDestination) => void;
  profileName: string;
  editorSidebarExpanded: boolean;
  onToggleEditorSidebar: () => void;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  badge?: string;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, active, onClick, badge }) => (
    <button
    className="nav-item"
    onClick={onClick}
    style={{
      width: '100%',
      height: '42px',
      minHeight: '42px',
      background: active ? 'var(--container)' : 'transparent',
      color: active ? 'var(--text)' : 'var(--text-secondary)',
      borderRadius: '10px',
      padding: '0 6px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontSize: '14px',
      fontWeight: active ? 600 : 500,
      letterSpacing: '-0.1px',
      transition: 'background var(--motion), color var(--motion)',
      justifyContent: 'flex-start',
    }}
    onMouseEnter={e => {
      if (!active) {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)';
      }
    }}
    onMouseLeave={e => {
      if (!active) {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
      }
    }}
    aria-label={label}
    aria-current={active ? 'page' : undefined}
  >
    {/* Icon container — square tile */}
    <span
      style={{
        width: '32px',
        height: '32px',
        minWidth: '32px',
        minHeight: '32px',
        borderRadius: '14px',
        background: active ? 'var(--container)' : 'rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {icon}
    </span>
    <span className="nav-item-label" style={{ flex: 1, textAlign: 'left' }}>{label}</span>
    {badge && (
      <span
        style={{
          background: 'var(--container)',
          color: 'var(--text-secondary)',
          fontSize: '11px',
          fontWeight: 600,
          borderRadius: '6px',
          padding: '2px 7px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {badge}
      </span>
    )}
  </button>
);

export const NavigationRail: React.FC<NavigationRailProps> = ({
  currentDestination,
  onNavigate,
  profileName,
  editorSidebarExpanded,
  onToggleEditorSidebar,
}) => {
  const initials = (profileName || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const isEditor = currentDestination === 'editor';

  return (
    <aside
      className="navigation-rail"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '220px',
        minWidth: '220px',
        gap: '8px',
        overflowY: 'auto',
        overflowX: 'hidden',
      }}
      aria-label="Application navigation"
    >
      {/* Panel 1 — Profile on Home, Z brand control in the Editor */}
      <div
        className="floating-panel navigation-brand-panel"
        style={{
          padding: '10px 6px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}
      >
        <div className={`navigation-profile-state ${!isEditor ? 'is-visible' : ''}`}>
          <div
            style={{
              width: '34px',
              height: '34px',
              minWidth: '34px',
              borderRadius: '14px',
              background: 'var(--container)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text)',
              cursor: 'pointer',
              letterSpacing: '-0.3px',
            }}
            onClick={() => onNavigate('settings')}
            title="Profile"
            role="button"
            aria-label="Profile"
          >
            {initials || <User size={16} />}
          </div>
          <button
            onClick={() => onNavigate('settings')}
            style={{
              flex: 1,
              background: 'transparent',
              color: 'var(--text)',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              justifyContent: 'flex-start',
              padding: 0,
              letterSpacing: '-0.1px',
              overflow: 'hidden',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profileName || 'Your Account'}
            </span>
            <ChevronDown size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          </button>
          <button
            style={{
              width: '32px',
              height: '32px',
              minWidth: '32px',
              borderRadius: '14px',
              background: 'var(--container)',
              color: 'var(--text-secondary)',
              padding: 0,
              flexShrink: 0,
            }}
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={15} />
          </button>
        </div>

        <div
          className={`navigation-editor-state ${isEditor ? 'is-visible' : ''}`}
          onClick={onToggleEditorSidebar}
          title={editorSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          role="button"
          aria-label={editorSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <span className="editor-brand-mark">Z</span>
          {isEditor && <span className="editor-brand-name">Zenopher</span>}
        </div>
      </div>

      {/* Panel 2 — Primary Nav + Bottom meta */}
      <div
        className="floating-panel"
        style={{
          padding: '8px 4px',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          gap: '2px',
          minHeight: 0,
        }}
      >
        {isEditor && (
          <div className={`editor-expanded-profile ${editorSidebarExpanded ? 'is-visible' : ''}`}>
            <div
              className="editor-expanded-profile-avatar"
              onClick={() => onNavigate('settings')}
              title="Profile"
              role="button"
              aria-label="Profile"
            >
              {initials || <User size={16} />}
            </div>
            <span className="editor-expanded-profile-name">{profileName || 'Your Account'}</span>
            <button className="editor-expanded-profile-bell" title="Notifications" aria-label="Notifications">
              <Bell size={15} />
            </button>
          </div>
        )}

        {/* Primary Nav */}
        <NavItem icon={<Clock size={16} />} label="Recents" active={currentDestination === 'home'} onClick={() => onNavigate('home')} />
        <NavItem icon={<LayoutGrid size={16} />} label="All designs" active={currentDestination === 'designs'} onClick={() => onNavigate('designs')} />
        <NavItem icon={<Trash2 size={16} />} label="Trash" active={currentDestination === 'trash'} onClick={() => onNavigate('trash')} />
        <NavItem icon={<FolderOpen size={16} />} label="Style library" active={currentDestination === 'styles'} onClick={() => onNavigate('styles')} />
        <NavItem icon={<LayoutTemplate size={16} />} label="Templates" active={currentDestination === 'templates'} onClick={() => onNavigate('templates')} />
        <NavItem icon={<BookOpen size={16} />} label="Tutorials" active={currentDestination === 'tutorials'} onClick={() => onNavigate('tutorials')} />

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Bottom meta */}
        <NavItem icon={<Settings size={16} />} label="Settings" active={currentDestination === 'settings'} onClick={() => onNavigate('settings')} />
        <NavItem icon={<Shield size={16} />} label="Privacy" active={currentDestination === 'privacy'} onClick={() => onNavigate('privacy')} />
        <NavItem icon={<HelpCircle size={16} />} label="Help & Support" active={currentDestination === 'help'} onClick={() => onNavigate('help')} />
        <NavItem icon={<FileText size={16} />} label="Legal" active={currentDestination === 'legal'} onClick={() => onNavigate('legal')} />
      </div>
    </aside>
  );
};
