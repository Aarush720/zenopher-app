import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Design } from '../../types';

interface PhotoCraftWasmWorkspaceProps {
  design: Design;
  onCanvasReady?: () => void;
  onDesignChange?: (updates: Partial<Design>) => void;
}

/**
 * Hosts PhotoCraft's real Rust/egui browser build.
 *
 * The editor is intentionally not recreated in React. The WASM build owns the
 * canvas, tools, menus, panels, shortcuts, document model, and rendering.
 */
export const PhotoCraftWasmWorkspace: React.FC<PhotoCraftWasmWorkspaceProps> = ({
  design,
  onCanvasReady,
  onDesignChange,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const source = import.meta.env.VITE_PHOTOCRAFT_WEB_URL?.trim() || '/photocraft/index.html';
  const sourceUrl = new URL(source, window.location.href);
  const iframeOrigin = sourceUrl.origin;
  sourceUrl.searchParams.set('zenopherOrigin', window.location.origin);
  sourceUrl.searchParams.set('zenopherBuild', '4');

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== iframeOrigin) return;
      const message = event.data as { source?: string; type?: string; bytes?: Uint8Array | ArrayBuffer; message?: string; design?: Partial<Design> };
      if (message?.source !== 'photocraft') return;

      if (message.type === 'photocraft:ready') {
        setBridgeError(null);
        const requestId = `open-${design.id}-${Date.now()}`;
        iframeRef.current?.contentWindow?.postMessage(
          { source: 'zenopher', type: 'zenopher:open-design', requestId, design },
          iframeOrigin,
        );
      }

      if (message.type === 'photocraft:opened') {
        setLoaded(true);
        onCanvasReady?.();
      }

      if (message.type === 'photocraft:error') {
        setLoaded(true);
        setBridgeError(message.message || 'Zenopher Creative Mode could not open this design.');
        onCanvasReady?.();
      }

      if (message.type === 'photocraft:saved' && message.bytes) {
        if (message.design) onDesignChange?.(message.design);
        const bytes = message.bytes instanceof Uint8Array ? message.bytes : new Uint8Array(message.bytes);
        const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'zenopher.pcraft';
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [design, iframeOrigin, onCanvasReady, onDesignChange]);

  return (
    <section className="photocraft-wasm-workspace" aria-label="Zenopher Creative workspace">
      {!loaded && (
        <div className="photocraft-wasm-loading" role="status">
          <RefreshCw size={16} className="photocraft-wasm-loading-icon" />
          <span>{bridgeError || 'Loading Zenopher Creative Mode…'}</span>
        </div>
      )}
      <iframe
        key={design.id}
        ref={iframeRef}
        className={`photocraft-wasm-frame${loaded ? ' is-loaded' : ''}`}
        title={`${design.title} — Zenopher Creative Mode`}
        src={sourceUrl.toString()}
        allow="clipboard-read; clipboard-write; webgpu"
      />
    </section>
  );
};
