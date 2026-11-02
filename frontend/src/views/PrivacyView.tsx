import React, { useState } from 'react';
import { Shield, Download, Trash2, Check, AlertTriangle } from 'lucide-react';
import { AppSettings } from '../types';
import { storage } from '../services/storage';

interface PrivacyViewProps {
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onDataReset: () => Promise<void>;
  sessionUser: boolean;
  onSyncConsent: (purpose: 'critique' | 'learning', granted: boolean) => Promise<void>;
}

export const PrivacyView: React.FC<PrivacyViewProps> = ({
  settings,
  onUpdateSettings,
  onDataReset,
  sessionUser,
  onSyncConsent,
}) => {
  const [aiConsent, setAiConsent] = useState<boolean>(settings.aiReviewConsent);
  const [learningConsent, setLearningConsent] = useState<boolean>(settings.learningDataConsent);
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<boolean>(false);

  const handleToggleAi = async () => {
    const next = !aiConsent;
    setAiConsent(next);
    onUpdateSettings({ aiReviewConsent: next });
    triggerToast();
    if (sessionUser) {
      try { await onSyncConsent('critique', next); }
      catch (error) { alert(`Could not sync review consent: ${(error as Error).message}`); }
    }
  };

  const handleToggleLearning = async () => {
    const next = !learningConsent;
    setLearningConsent(next);
    onUpdateSettings({ learningDataConsent: next });
    triggerToast();
    if (sessionUser) {
      try { await onSyncConsent('learning', next); }
      catch (error) { alert(`Could not sync learning consent: ${(error as Error).message}`); }
    }
  };

  const triggerToast = () => {
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  const handleExportAllData = async () => {
    const allDesigns = await storage.getAllDesigns();
    const appSettings = await storage.getSettings();
    const payload = {
      app: 'Zenopher',
      exportedAt: new Date().toISOString(),
      designs: allDesigns,
      settings: appSettings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zenopher-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDeleteAllLocalData = async () => {
    try {
      await storage.clearAllData();
      await onDataReset();
      setConfirmDelete(false);
    } catch (error) {
      alert(`Could not delete local data: ${(error as Error).message}`);
    }
  };

  return (
    <div className="workspace" style={{ gridTemplateColumns: '1fr' }}>
      <section 
        className="floating-panel"
        style={{
          padding: 'var(--space-panel-padding)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
          overflowY: 'auto',
          height: '100%',
          maxWidth: '800px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={24} color="var(--text)" />
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text)' }}>
              Privacy & Consent Controls
            </h2>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.5 }}>
            Settings and Privacy are separate destinations on purpose. The consent controls must be easy to find and change, and never buried inside general preferences.
          </p>
        </div>

        {/* Local-First Architecture Guarantee */}
        <div 
          style={{ 
            background: 'var(--container)', 
            borderRadius: 'var(--radius-section)', 
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
            Zero-Cloud Telemetry Guarantee
          </span>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Zenopher is local-first: drafts continue saving in your browser’s IndexedDB sandbox. If you sign in, encrypted design versions and explicitly enabled consent records can also be stored in your private cloud workspace. There is no background canvas upload while you are signed out.
          </p>
        </div>

        {/* Consent Switches */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* AI Review Consent */}
          <div 
            style={{ 
              background: 'var(--container)', 
              borderRadius: 'var(--radius-control)', 
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px'
            }}
          >
            <div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', display: 'block' }}>
                Automated Review Analysis
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                Allow the local review engine to run mathematical checks on contrast, alignment, typography, and crop bounds.
              </span>
            </div>
            <button
              className={aiConsent ? 'selected' : ''}
              style={{ width: '52px', height: '32px', borderRadius: '16px', padding: 0 }}
              onClick={handleToggleAi}
            >
              {aiConsent ? <Check size={16} /> : null}
            </button>
          </div>

          {/* Learning Data Toggle */}
          <div 
            style={{ 
              background: 'var(--container)', 
              borderRadius: 'var(--radius-control)', 
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px'
            }}
          >
            <div>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', display: 'block' }}>
                Local Layout Pattern Memory
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', display: 'block' }}>
                Keep anonymized records of recurring layout corrections locally on this device to streamline repetitive fixes.
              </span>
            </div>
            <button
              className={learningConsent ? 'selected' : ''}
              style={{ width: '52px', height: '32px', borderRadius: '16px', padding: 0 }}
              onClick={handleToggleLearning}
            >
              {learningConsent ? <Check size={16} /> : null}
            </button>
          </div>
        </div>

        {/* Data Portability & Destruction */}
        <div 
          style={{ 
            background: 'var(--container)', 
            borderRadius: 'var(--radius-section)', 
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            marginTop: '8px'
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text)' }}>
            Data Portability & Device Storage
          </span>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <button
              className="primary"
              style={{ height: '42px', padding: '0 18px', fontSize: '12px', fontWeight: 700, borderRadius: '12px', gap: '8px' }}
              onClick={handleExportAllData}
            >
              <Download size={15} />
              <span>Export Complete Data Backup (.json)</span>
            </button>

            {confirmDelete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#FF7B7B', fontWeight: 600 }}>Wipe all local designs?</span>
                <button
                  style={{ height: '42px', padding: '0 16px', fontSize: '12px', background: '#D32F2F', color: '#FFFFFF', borderRadius: '12px' }}
                  onClick={handleDeleteAllLocalData}
                >
                  Yes, Wipe Everything
                </button>
                <button
                  style={{ height: '42px', padding: '0 12px', fontSize: '12px', borderRadius: '12px' }}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                style={{
                  height: '42px',
                  padding: '0 18px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '12px',
                  gap: '8px',
                  background: 'var(--container-hover)',
                  color: '#FF7B7B',
                }}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={15} />
                <span>Delete All Device Data</span>
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

