import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Design } from '../../types';

interface PhotoCraftWasmWorkspaceProps {
  design: Design;
  toolProfile?: 'creative' | 'corporate';
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
  toolProfile = design.mode,
  onCanvasReady,
  onDesignChange,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const designRef = useRef(design);
  const onCanvasReadyRef = useRef(onCanvasReady);
  const onDesignChangeRef = useRef(onDesignChange);
  const lastSyncedDesignRef = useRef<string | null>(null);
  const source = import.meta.env.VITE_PHOTOCRAFT_WEB_URL?.trim() || '/photocraft/index.html';
  const sourceUrl = new URL(source, window.location.href);
  const iframeOrigin = sourceUrl.origin;
  sourceUrl.searchParams.set('zenopherOrigin', window.location.origin);
  sourceUrl.searchParams.set('zenopherBuild', '5');
  sourceUrl.searchParams.set('zenopherMode', toolProfile);

  useEffect(() => { designRef.current = design; }, [design]);
  useEffect(() => { onCanvasReadyRef.current = onCanvasReady; }, [onCanvasReady]);
  useEffect(() => { onDesignChangeRef.current = onDesignChange; }, [onDesignChange]);

  useEffect(() => {
    let finished = false;
    const fail = (message: string) => {
      if (finished) return;
      finished = true;
      setLoaded(true);
      setBridgeError(message);
      onCanvasReadyRef.current?.();
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || event.origin !== iframeOrigin) return;
      const message = event.data as { source?: string; type?: string; bytes?: Uint8Array | ArrayBuffer; message?: string; design?: Partial<Design> };
      if (message?.source !== 'photocraft') return;

      if (message.type === 'photocraft:ready') {
        setBridgeError(null);
        const requestId = `open-${design.id}-${Date.now()}`;
        iframeRef.current?.contentWindow?.postMessage(
          { source: 'zenopher', type: 'zenopher:open-design', requestId, design: designRef.current },
          iframeOrigin,
        );
      }

      if (message.type === 'photocraft:opened') {
        finished = true;
        setLoaded(true);
        setBridgeError(null);
        onCanvasReadyRef.current?.();
      }

      if (message.type === 'photocraft:error') {
        fail(message.message || `Zenopher ${toolProfile === 'corporate' ? 'Corporate' : 'Creative'} Mode could not open this design.`);
      }

      if (message.type === 'photocraft:changed' && message.design) {
        const serialized = JSON.stringify(message.design);
        if (serialized !== lastSyncedDesignRef.current) {
          lastSyncedDesignRef.current = serialized;
          onDesignChangeRef.current?.(message.design);
        }
      }

      if (message.type === 'photocraft:saved' && message.bytes) {
        if (message.design) {
          lastSyncedDesignRef.current = JSON.stringify(message.design);
          onDesignChangeRef.current?.(message.design);
        }
        const bytes = message.bytes instanceof Uint8Array ? message.bytes : new Uint8Array(message.bytes);
        const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'zenopher.pcraft';
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    };

    const startupTimer = window.setTimeout(() => {
      fail('PhotoCraft did not finish loading. Check that WebAssembly assets are available and that the browser supports WebGL2 or WebGPU.');
    }, 60_000);
    window.addEventListener('message', handleMessage);
    return () => {
      window.clearTimeout(startupTimer);
      window.removeEventListener('message', handleMessage);
    };
  }, [design.id, iframeOrigin, toolProfile]);

  // PhotoCraft owns the live document inside the iframe. Periodic sync keeps Zenopher's local
  // design record current without exporting a download on every edit.
  useEffect(() => {
    if (!loaded || bridgeError) return undefined;
    const syncTimer = window.setInterval(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { source: 'zenopher', type: 'zenopher:sync', requestId: `sync-${design.id}-${Date.now()}` },
        iframeOrigin,
      );
    }, 1500);
    return () => window.clearInterval(syncTimer);
  }, [loaded, bridgeError, design.id, iframeOrigin]);

  return (
    <section className={`photocraft-wasm-workspace photocraft-${toolProfile}-workspace`} aria-label={`Zenopher ${toolProfile} workspace`}>
      {(!loaded || bridgeError) && (
        <div className={`photocraft-wasm-loading${bridgeError ? ' is-error' : ''}`} role="status">
          {!bridgeError && <RefreshCw size={16} className="photocraft-wasm-loading-icon" />}
          <span>{bridgeError || `Loading Zenopher ${toolProfile === 'corporate' ? 'Corporate' : 'Creative'} Mode…`}</span>
        </div>
      )}
      <iframe
        key={`${design.id}-${toolProfile}`}
        ref={iframeRef}
        className={`photocraft-wasm-frame${loaded ? ' is-loaded' : ''}`}
        title={`${design.title} — Zenopher ${toolProfile === 'corporate' ? 'Corporate' : 'Creative'} Mode`}
        src={sourceUrl.toString()}
        allow="clipboard-read; clipboard-write; webgpu"
        onError={() => {
          setLoaded(true);
          setBridgeError('PhotoCraft could not load its iframe document.');
        }}
      />
    </section>
  );
};
