import React, { useState } from 'react';
import { User, Sliders, HardDrive, Check, Save, LogIn, LogOut, Cloud, Download, Trash2, RotateCcw } from 'lucide-react';
import { AppSettings, DesignMode, Unit } from '../types';
import { STYLE_PROFILES } from '../data/styles';
import { ApiAccount, ApiUser } from '../services/api';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  sessionUser: ApiUser | null;
  backendStatus: 'disabled' | 'checking' | 'online' | 'offline';
  onSignIn: () => void;
  onSignOut: () => void;
  account: ApiAccount | null;
  onExportAccount: () => Promise<void>;
  onScheduleDeletion: () => Promise<void>;
  onCancelDeletion: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  sessionUser,
  backendStatus,
  onSignIn,
  onSignOut,
  account,
  onExportAccount,
  onScheduleDeletion,
  onCancelDeletion,
}) => {
  const [profileName, setProfileName] = useState<string>(settings.profileName);
  const [defaultMode, setDefaultMode] = useState<DesignMode>(settings.defaultMode);
  const [defaultStyle, setDefaultStyle] = useState<string>(settings.defaultStyle || '');
  const [autosaveInterval, setAutosaveInterval] = useState<number>(settings.autosaveInterval);
  const [defaultUnit, setDefaultUnit] = useState<Unit>(settings.defaultUnit);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);

  const handleSave = () => {
    onUpdateSettings({
      profileName,
      defaultMode,
      defaultStyle,
      autosaveInterval,
      defaultUnit,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="workspace" style={{ gridTemplateColumns: 'minmax(320px, 0.4fr) minmax(0, 0.6fr)' }}>
      {/* Settings Navigation / Overview */}
      <section 
        className="floating-panel"
        style={{
          padding: 'var(--space-panel-padding)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>
            Settings
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Device-level preferences for design creation and editing defaults.
          </p>
        </div>

        <div style={{ background: 'var(--container)', borderRadius: 'var(--radius-section)', padding: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div 
            style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: 'var(--radius-tile)', 
              background: 'var(--surface)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '18px',
              color: 'var(--text)'
            }}
          >
            {profileName ? profileName.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
              {sessionUser?.display_name || profileName || 'Anonymous Designer'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {sessionUser?.email || 'Stored locally on this device'}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--container)', borderRadius: 'var(--radius-section)', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Cloud size={16} color="var(--text)" />
            <span style={{ fontSize: '12px', fontWeight: 700 }}>Cloud workspace</span>
            <span style={{ marginLeft: 'auto', fontSize: '10px', color: backendStatus === 'online' ? '#4ADE80' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {backendStatus === 'checking' ? 'CHECKING' : backendStatus === 'online' ? 'READY' : backendStatus === 'disabled' ? 'LOCAL ONLY' : 'OFFLINE'}
            </span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '12px' }}>
            {sessionUser ? 'Signed-in designs sync in the background. Local editing continues when the backend is unavailable.' : 'Sign in when you want encrypted sync, sharing, critique, and account controls.'}
          </p>
          {sessionUser ? (
            <button onClick={onSignOut} style={{ height: '36px', padding: '0 12px', gap: '7px', fontSize: '12px' }}>
              <LogOut size={14} /> Sign out
            </button>
          ) : (
            <button className="primary" onClick={onSignIn} disabled={backendStatus === 'disabled'} style={{ height: '36px', padding: '0 12px', gap: '7px', fontSize: '12px' }}>
              <LogIn size={14} /> Sign in to sync
            </button>
          )}
        </div>

        {sessionUser && account && (
          <div style={{ background: 'var(--container)', borderRadius: 'var(--radius-section)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <User size={16} color="var(--text)" />
              <span style={{ fontSize: '12px', fontWeight: 700 }}>Account controls</span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '12px' }}>
              {account.status === 'pending_deletion'
                ? `Account deletion is scheduled for ${account.deletion_at ? new Date(account.deletion_at * 1000).toLocaleDateString() : 'a later date'}.`
                : 'Export your cloud data or schedule account deletion with its recovery grace period.'}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button onClick={onExportAccount} style={{ height: '34px', padding: '0 10px', gap: '6px', fontSize: '11px' }}>
                <Download size={13} /> Export data
              </button>
              {account.status === 'pending_deletion' ? (
                <button className="primary" onClick={onCancelDeletion} style={{ height: '34px', padding: '0 10px', gap: '6px', fontSize: '11px' }}>
                  <RotateCcw size={13} /> Cancel deletion
                </button>
              ) : (
                <button onClick={onScheduleDeletion} style={{ height: '34px', padding: '0 10px', gap: '6px', fontSize: '11px', color: '#FF7B7B' }}>
                  <Trash2 size={13} /> Delete account
                </button>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 'auto', background: 'var(--container)', borderRadius: 'var(--radius-section)', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <HardDrive size={16} color="var(--text)" />
            <span style={{ fontSize: '12px', fontWeight: 600 }}>Storage Architecture</span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Designs and settings always autosave to browser IndexedDB first. Cloud sync only runs after you sign in.
          </p>
        </div>
      </section>

      {/* Main Settings Form */}
      <section 
        className="floating-panel"
        style={{
          padding: 'var(--space-panel-padding)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          overflowY: 'auto',
        }}
      >
        {/* Profile Name */}
        <div>
          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '8px' }}>
            Profile Name
          </label>
          <input
            type="text"
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            placeholder="Enter your name"
            style={{ maxWidth: '380px' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
            Used for local greetings and project metadata.
          </span>
        </div>

        {/* Default Mode */}
        <div>
          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '8px' }}>
            Default Mode for New Designs
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', maxWidth: '420px' }}>
            <div
              className={`tile ${defaultMode === 'creative' ? 'selected' : ''}`}
              style={{ height: '90px', padding: '12px' }}
              onClick={() => setDefaultMode('creative')}
            >
              <span style={{ fontSize: '14px', fontWeight: 700 }}>Creative</span>
              <span style={{ fontSize: '11px', opacity: 0.7, textAlign: 'center', marginTop: '4px' }}>
                Quiet, uninterrupted design
              </span>
            </div>
            <div
              className={`tile ${defaultMode === 'corporate' ? 'selected' : ''}`}
              style={{ height: '90px', padding: '12px' }}
              onClick={() => setDefaultMode('corporate')}
            >
              <span style={{ fontSize: '14px', fontWeight: 700 }}>Corporate</span>
              <span style={{ fontSize: '11px', opacity: 0.7, textAlign: 'center', marginTop: '4px' }}>
                Continuous layout checks
              </span>
            </div>
          </div>
        </div>

        {/* Default Style */}
        <div>
          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '8px' }}>
            Default Style Profile
          </label>
          <select
            value={defaultStyle}
            onChange={(e) => setDefaultStyle(e.target.value)}
            style={{ maxWidth: '380px' }}
          >
            <option value="">None (Standard Base Checks)</option>
            {STYLE_PROFILES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.description})
              </option>
            ))}
          </select>
        </div>

        {/* Measurement Unit */}
        <div>
          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '8px' }}>
            Default Canvas Measurement Unit
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['px', 'mm', 'in'] as Unit[]).map((u) => (
              <button
                key={u}
                className={defaultUnit === u ? 'selected' : ''}
                style={{ width: '60px', height: '40px', fontSize: '13px', fontWeight: 600, borderRadius: '12px' }}
                onClick={() => setDefaultUnit(u)}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* Autosave Interval */}
        <div>
          <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: '8px' }}>
            Autosave Frequency
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[5, 15, 30, 60].map((sec) => (
              <button
                key={sec}
                className={autosaveInterval === sec ? 'selected' : ''}
                style={{ height: '40px', padding: '0 16px', fontSize: '12px', fontWeight: 600, borderRadius: '12px' }}
                onClick={() => setAutosaveInterval(sec)}
              >
                {sec}s
              </button>
            ))}
          </div>
        </div>

        {/* Save Changes Button */}
        <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            className="primary"
            style={{ height: '44px', padding: '0 24px', fontSize: '13px', fontWeight: 700, borderRadius: 'var(--radius-control)', gap: '8px' }}
            onClick={handleSave}
          >
            <Save size={16} />
            <span>Save Settings</span>
          </button>
          {savedNotice && (
            <span style={{ fontSize: '12px', color: '#4ADE80', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check size={14} /> Saved to device
            </span>
          )}
        </div>
      </section>
    </div>
  );
};

