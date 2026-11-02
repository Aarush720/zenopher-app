import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, LoaderCircle } from 'lucide-react';
import { FloatingCanvasWorkspace } from '../components/editor/FloatingCanvasWorkspace';
import { Design } from '../types';
import { api } from '../services/api';
import { decodeDesignDocument, hydrateDesignAssets } from '../services/sync';

interface SharedDesignViewProps {
  token: string;
  onClose: () => void;
}

export const SharedDesignView: React.FC<SharedDesignViewProps> = ({ token, onClose }) => {
  const [design, setDesign] = useState<Design | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getSharedDesign(token), api.getSharedContent(token),])
      .then(async ([meta, content]) => {
        const document = await hydrateDesignAssets(await decodeDesignDocument(content), token);
        if (cancelled) return;
        setDesign({
          ...document,
          title: meta.title || document.title,
          mode: meta.mode,
          remoteId: meta.id,
          remoteVersion: meta.current_version,
        });
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'This share link is unavailable.');
      });
    return () => { cancelled = true; };
  }, [token]);

  if (error) {
    return (
      <div className="app-loading" role="alert" style={{ gap: '16px' }}>
        <AlertTriangle size={24} />
        <span>{error}</span>
        <button onClick={onClose} style={{ height: '38px', padding: '0 14px', gap: '6px' }}><ArrowLeft size={15} /> Back to Zenopher</button>
      </div>
    );
  }

  if (!design) {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        <LoaderCircle size={22} className="spin" />
        <span>Loading shared design…</span>
      </div>
    );
  }

  return (
    <div className="app-shell editor-mode" style={{ gridTemplateColumns: '1fr' }}>
      <div className="main-area" style={{ marginLeft: 0 }}>
        <header className="floating-panel top-bar is-editor" style={{ height: '50px', minHeight: '50px', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn-square" onClick={onClose} aria-label="Back to Zenopher" title="Back to Zenopher" style={{ width: '36px', height: '36px' }}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <strong style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{design.title}</strong>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Shared view · Read only</span>
          </div>
        </header>
        <div className="editor-workspace" style={{ gridTemplateColumns: '1fr' }}>
          <FloatingCanvasWorkspace
            design={design}
            selectedLayerId={null}
            onSelectLayer={() => undefined}
            onUpdateLayer={() => undefined}
          />
        </div>
      </div>
    </div>
  );
};
