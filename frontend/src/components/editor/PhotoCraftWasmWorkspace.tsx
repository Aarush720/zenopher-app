import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Design } from '../../types';
import { EditorMenuBar } from './EditorMenuBar';
import { EditorMenuClient, EditorMenuResponse } from './editorMenu';
import { needsPhotoCraftWebGl } from './photocraftRuntime';
import { CanvasTeacherClient, type RunTeacherCommands } from './teacherCommands';

interface PhotoCraftWasmWorkspaceProps {
  design: Design;
  toolProfile?: 'creative' | 'corporate';
  fileToOpen?: { name: string; bytes: Uint8Array } | null;
  onCanvasReady?: () => void;
  onTeacherReady?: (run: RunTeacherCommands | null) => void;
  onDesignChange?: (updates: Partial<Design>) => void;
  onFileOpened?: () => void;
  onRequestOpenFile?: () => void;
  onUndo?: () => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
}

function contentUpdates(design: Partial<Design>): Partial<Design> {
  // The iframe's opening snapshot can contain stale API/session metadata.
  // Only document content belongs in the periodic editor response.
  return Object.fromEntries((['width', 'height', 'background', 'layers', 'editorRevision'] as const)
    .filter((key) => design[key] !== undefined)
    .map((key) => [key, design[key]]));
}

/**
 * Hosts PhotoCraft's real Rust/egui browser build.
 *
 * The editor is intentionally not recreated in React. The WASM build owns the
 * canvas, tools, panels, shortcuts, document model, and rendering. The host menu
 * dispatches through the native menu catalogue rather than duplicating editor behavior.
 */
export const PhotoCraftWasmWorkspace: React.FC<PhotoCraftWasmWorkspaceProps> = ({
  design,
  toolProfile = design.mode,
  fileToOpen = null,
  onCanvasReady,
  onTeacherReady,
  onDesignChange,
  onFileOpened,
  onRequestOpenFile,
  onUndo,
  onGestureStart,
  onGestureEnd,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // A mode switch changes the native tool surface, not the document/iframe lifetime.
  const [launchProfile] = useState(toolProfile);
  const profileRef = useRef(toolProfile);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const designRef = useRef(design);
  const onCanvasReadyRef = useRef(onCanvasReady);
  const onFileOpenedRef = useRef(onFileOpened);
  const onRequestOpenFileRef = useRef(onRequestOpenFile);
  const fileToOpenRef = useRef(fileToOpen);
  const fileOpenRequestRef = useRef<string | null>(null);
  const onDesignChangeRef = useRef(onDesignChange);
  const onUndoRef = useRef(onUndo);
  const onGestureStartRef = useRef(onGestureStart);
  const onGestureEndRef = useRef(onGestureEnd);
  const gestureRef = useRef(false);
  const activityRef = useRef(Date.now());
  const openedRef = useRef(false);
  const menuClient = useRef<EditorMenuClient | null>(null);
  const requestMenu = useCallback((command?: string) => {
    if (command) activityRef.current = Date.now();
    // File dialogs must be opened by the top-level document. PhotoCraft runs in
    // an iframe, so handling file.open inside the WASM menu cannot reach the
    // browser picker (and Safari blocks the detached iframe request).
    if (command === 'file.open' || command === 'file.openAs') {
      onRequestOpenFileRef.current?.();
      return Promise.resolve({ ok: true, result: [] });
    }
    return menuClient.current?.request(command) ?? Promise.reject(new Error('The editor is still loading.'));
  }, []);
  const focusCanvas = useCallback(() => iframeRef.current?.contentWindow?.focus(), []);
  // Keep PhotoCraft local while the hosted R2/Worker distribution is paused.
  // Vite serves this bundle from public/photocraft during development.
  const sourceUrl = new URL('/photocraft/index.html', window.location.origin);
  const iframeOrigin = sourceUrl.origin;
  sourceUrl.searchParams.set('zenopherBuild', '9');
  sourceUrl.searchParams.set('zenopherMode', launchProfile);
  sourceUrl.searchParams.set('zenopherMenu', 'pill');
  if (needsPhotoCraftWebGl(navigator.userAgent)) sourceUrl.searchParams.set('webgl', '1');

  useEffect(() => { designRef.current = design; }, [design]);
  useEffect(() => { onCanvasReadyRef.current = onCanvasReady; }, [onCanvasReady]);
  useEffect(() => { onFileOpenedRef.current = onFileOpened; }, [onFileOpened]);
  useEffect(() => { onRequestOpenFileRef.current = onRequestOpenFile; }, [onRequestOpenFile]);
  useEffect(() => {
    fileToOpenRef.current = fileToOpen;
    if (!fileToOpen) fileOpenRequestRef.current = null;
  }, [fileToOpen]);
  useEffect(() => {
    if (!openedRef.current || !fileToOpen) return;
    const requestKey = `${fileToOpen.name}:${fileToOpen.bytes.byteLength}`;
    if (fileOpenRequestRef.current === requestKey) return;
    fileOpenRequestRef.current = requestKey;
    iframeRef.current?.contentWindow?.postMessage({
      source: 'zenopher',
      type: 'zenopher:open-file',
      requestId: `open-file-${Date.now()}`,
      name: fileToOpen.name,
      bytes: fileToOpen.bytes,
    }, iframeOrigin);
  }, [fileToOpen, iframeOrigin]);
  useEffect(() => { onDesignChangeRef.current = onDesignChange; }, [onDesignChange]);
  useEffect(() => { onUndoRef.current = onUndo; }, [onUndo]);
  useEffect(() => { onGestureStartRef.current = onGestureStart; }, [onGestureStart]);
  useEffect(() => { onGestureEndRef.current = onGestureEnd; }, [onGestureEnd]);
  useEffect(() => {
    profileRef.current = toolProfile;
    if (openedRef.current) {
      iframeRef.current?.contentWindow?.postMessage({
        source: 'zenopher', type: 'zenopher:profile', requestId: `profile-${Date.now()}`, mode: toolProfile,
      }, iframeOrigin);
    }
  }, [toolProfile, iframeOrigin]);

  const applyNativeDesignUpdate = (nativeDesign: Partial<Design>) => {
    const updates = contentUpdates(nativeDesign);
    if (Object.keys(updates).length === 0) return;
    // Keep the command bridge ahead of React's next render. Teacher fixes are
    // revision-checked by PhotoCraft, so a render-delayed revision can make a
    // valid finding look stale when Apply is clicked immediately after a sync.
    designRef.current = { ...designRef.current, ...updates };
    onDesignChangeRef.current?.(updates);
  };

  useEffect(() => {
    setLoaded(false);
    setBridgeError(null);
    openedRef.current = false;
    fileOpenRequestRef.current = null;
    gestureRef.current = false;
    const client = new EditorMenuClient((message) => {
      const target = iframeRef.current?.contentWindow;
      if (!target) throw new Error('The editor is still loading.');
      target.postMessage(message, iframeOrigin);
    });
    menuClient.current = client;
    const teacherClient = new CanvasTeacherClient(message => {
      const target = iframeRef.current?.contentWindow;
      if (!target) throw new Error('The editor is still loading.');
      target.postMessage(message, iframeOrigin);
    });
    onTeacherReady?.((commands, ids) => {
      if (!openedRef.current) return Promise.reject(new Error('The canvas is still loading.'));
      return teacherClient.run(designRef.current, commands, ids);
    });
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
      const message = event.data as { source?: string; type?: string; requestId?: string; response?: EditorMenuResponse & { design?: Partial<Design> }; bytes?: Uint8Array | ArrayBuffer; message?: string; design?: Partial<Design> };
      if (message?.source !== 'photocraft') return;

      if (message.type === 'photocraft:teacher-result' && message.requestId && message.response) {
        if (message.response.design) applyNativeDesignUpdate(message.response.design);
        teacherClient.receive(message.requestId, message.response);
        // A stale revision needs an immediate resync, even when the user is idle.
        iframeRef.current?.contentWindow?.postMessage({ source: 'zenopher', type: 'zenopher:sync', requestId: `teacher-sync-${Date.now()}` }, iframeOrigin);
        return;
      }

      if (message.type === 'photocraft:menu-result'  && message.requestId && message.response) {
        client.receive(message.requestId, message.response);
        return;
      }

      if (message.type === 'photocraft:ready') {
        setBridgeError(null);
        const requestId = `open-${design.id}-${Date.now()}`;
        iframeRef.current?.contentWindow?.postMessage(
          { source: 'zenopher', type: 'zenopher:open-design', requestId, design: { ...designRef.current, editorRevision: undefined } },
          iframeOrigin,
        );
      }

      if (message.type === 'photocraft:opened') {
        openedRef.current = true;
        // Pick up a mode change made while the document was still opening.
        iframeRef.current?.contentWindow?.postMessage({
          source: 'zenopher', type: 'zenopher:profile', requestId: `profile-${Date.now()}`, mode: profileRef.current,
        }, iframeOrigin);
        iframeRef.current?.contentWindow?.postMessage({ source: 'zenopher', type: 'zenopher:sync', requestId: 'initial-sync' }, iframeOrigin);
        const pendingFile = fileToOpenRef.current;
        if (pendingFile) {
          const requestKey = `${pendingFile.name}:${pendingFile.bytes.byteLength}`;
          if (fileOpenRequestRef.current !== requestKey) {
            fileOpenRequestRef.current = requestKey;
            iframeRef.current?.contentWindow?.postMessage({
              source: 'zenopher',
              type: 'zenopher:open-file',
              requestId: `open-file-${Date.now()}`,
              name: pendingFile.name,
              bytes: pendingFile.bytes,
            }, iframeOrigin);
          }
        }
        finished = true;
        setLoaded(true);
        setBridgeError(null);
        onCanvasReadyRef.current?.();
      }

      if (message.type === 'photocraft:error') {
        fail(message.message || `Zenopher ${profileRef.current === 'corporate' ? 'Corporate' : 'Creative'} Mode could not open this design.`);
      }

      if (message.type === 'photocraft:changed' && message.design) {
        // The native bridge already suppresses unchanged documents. The app
        // structurally shares unchanged layers without stringifying image data.
        applyNativeDesignUpdate(message.design);
      }

      if (message.type === 'photocraft:file-opened' && message.design) {
        applyNativeDesignUpdate(message.design);
        fileToOpenRef.current = null;
        onFileOpenedRef.current?.();
      }

      // PhotoCraft undo: learning signal, not a content change.
      if (message.type === 'photocraft:undo') {
        activityRef.current = Date.now();
        onUndoRef.current?.();
      }
      if (message.type === 'photocraft:gesture-start') {
        gestureRef.current = true;
        activityRef.current = Date.now();
        onGestureStartRef.current?.();
      }
      if (message.type === 'photocraft:gesture-end') {
        gestureRef.current = false;
        activityRef.current = Date.now();
        onGestureEndRef.current?.();
      }

      if (message.type === 'photocraft:saved' && message.bytes) {
        if (message.design) {
          applyNativeDesignUpdate(message.design);
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
      client.dispose();
      teacherClient.dispose();
      onTeacherReady?.(null);
      if (menuClient.current === client) menuClient.current = null;
    };
  }, [design.id, iframeOrigin, attempt]);

  // PhotoCraft owns the live document inside the iframe. Periodic sync keeps Zenopher's local
  // design record current without exporting a download on every edit.
  useEffect(() => {
    if (!loaded || bridgeError) return undefined;
    let lastSync = 0;
    const syncTimer = window.setInterval(() => {
      if (!openedRef.current || document.hidden || gestureRef.current) return;
      const now = Date.now();
      // Raster readback is costly. Keep prompt updates after interaction, with
      // a slower idle fallback for commands that complete asynchronously.
      if (now - activityRef.current > 5000 && now - lastSync < 15_000) return;
      lastSync = now;
      iframeRef.current?.contentWindow?.postMessage(
        { source: 'zenopher', type: 'zenopher:sync', requestId: `sync-${design.id}-${Date.now()}` },
        iframeOrigin,
      );
    }, 1500);
    return () => window.clearInterval(syncTimer);
  }, [loaded, bridgeError, design.id, iframeOrigin]);

  return (
    <section className={`photocraft-wasm-workspace photocraft-${toolProfile}-workspace`} aria-label={`Zenopher ${toolProfile} workspace`}>
      <EditorMenuBar title={design.title} enabled={loaded && !bridgeError} request={requestMenu} focusCanvas={focusCanvas} />
      <div className="photocraft-wasm-quickbar" role="toolbar" aria-label="Canvas shortcuts">
        <button
          type="button"
          className="photocraft-wasm-quickbar-button"
          disabled={!loaded || !!bridgeError}
          title="Deselect the active layer (Select > Deselect Layers). Click grey pasteboard outside the document also clears it."
          onClick={() => { void requestMenu('select.deselectLayers').catch(() => {}); }}
        >
          Deselect
        </button>
      </div>
      {(!loaded || bridgeError) && (
        <div className={`photocraft-wasm-loading${bridgeError ? ' is-error' : ''}`} role="status" style={loaded && bridgeError ? { position: 'relative', inset: 'auto', padding: '20px', background: '#1a1a1a', borderRadius: '12px', margin: '12px' } : undefined}>
          {!bridgeError && <RefreshCw size={16} className="photocraft-wasm-loading-icon" />}
          <span>{bridgeError || `Loading Zenopher ${toolProfile === 'corporate' ? 'Corporate' : 'Creative'} Mode…`}</span>
          {loaded && bridgeError && (
            <button
              style={{ marginTop: '10px', padding: '8px 14px', borderRadius: '8px', background: '#fff', color: '#000', fontWeight: 700, fontSize: '12px' }}
              onClick={() => {
                setBridgeError(null);
                setLoaded(false);
                // Force the iframe to remount and retry.
                setAttempt((previous) => previous + 1);
              }}
            >
              Retry canvas
            </button>
          )}
        </div>
      )}
      <iframe
        key={`${design.id}-${attempt}`}
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
