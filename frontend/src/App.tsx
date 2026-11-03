import React, { useState, useEffect, useRef } from 'react';
import { NavigationRail } from './components/NavigationRail';
import { TopBar } from './components/TopBar';
import { HomeView } from './views/HomeView';
import { DesignsView } from './views/DesignsView';
import { TemplatesView } from './views/TemplatesView';
import { TrashView } from './views/TrashView';
import { StylesView } from './views/StylesView';
import { TutorialsView } from './views/TutorialsView';
import { SettingsView } from './views/SettingsView';
import { PrivacyView } from './views/PrivacyView';
import { LegalView } from './views/LegalView';
import { HelpView } from './views/HelpView';
import { SharedDesignView } from './views/SharedDesignView';

import { PhotoCraftWasmWorkspace } from './components/editor/PhotoCraftWasmWorkspace';
import { ReviewPanel } from './components/editor/ReviewPanel';

import { NewDesignModal } from './components/NewDesignModal';
import { ExportModal } from './components/ExportModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { RenameModal } from './components/RenameModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { StylePickerModal } from './components/StylePickerModal';
import { OfflineBanner } from './components/OfflineBanner';
import { AuthModal } from './components/AuthModal';
import { ShareModal } from './components/ShareModal';

import { 
  Design, 
  NavigationDestination, 
  AppSettings, 
  PresetSize, 
  StyleProfile, 
  Layer, 
  LayerType, 
  DesignMode, 
  Unit,
  ReviewFinding,
} from './types';
import { storage, DEFAULT_SETTINGS } from './services/storage';
import { STYLE_PROFILES } from './data/styles';
import { api, ApiAccount, ApiConfig, ApiUser, BackendUnavailableError } from './services/api';
import { pullRemoteDesigns, syncDesign } from './services/sync';
import { renderDesignToPng } from './services/render';
import { useRustTeacher } from './teacher/useRustTeacher';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read the selected image'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected image'));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1080, height: img.naturalHeight || 1080 });
    img.onerror = () => reject(new Error('The selected image could not be decoded'));
    img.src = src;
  });
}

function preloadDesignAssets(design: Design): Promise<void[]> {
  const imageSources = design.layers
    .filter((layer) => layer.type === 'image' && layer.imageUrl)
    .map((layer) => layer.imageUrl as string);

  return Promise.all(imageSources.map((source) => new Promise<void>((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = source;
  })));
}

export const App: React.FC = () => {
  // Navigation & History State
  const [currentDestination, setCurrentDestination] = useState<NavigationDestination>('home');
  const [historyStack, setHistoryStack] = useState<NavigationDestination[]>(['home']);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // App Data & Settings
  const [designs, setDesigns] = useState<Design[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [sessionUser, setSessionUser] = useState<ApiUser | null>(api.user);
  const [account, setAccount] = useState<ApiAccount | null>(null);
  const [backendStatus, setBackendStatus] = useState<'disabled' | 'checking' | 'online' | 'offline'>(api.configured ? 'checking' : 'disabled');
  const [backendConfig, setBackendConfig] = useState<ApiConfig | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharedDesignToken, setSharedDesignToken] = useState<string | null>(null);

  // Active Editor State
  const [activeDesignId, setActiveDesignId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [openingDesignId, setOpeningDesignId] = useState<string | null>(null);
  const [editorSidebarExpanded, setEditorSidebarExpanded] = useState(false);
  const [editorEntryPhase, setEditorEntryPhase] = useState<'idle' | 'ready' | 'expanding' | 'covered' | 'revealing'>('idle');
  const [editorEntryRect, setEditorEntryRect] = useState<{ left: number; top: number; width: number; height: number; borderRadius: number } | null>(null);
  const [editorEntryTargetRect, setEditorEntryTargetRect] = useState<{ left: number; top: number; width: number; height: number; borderRadius: number } | null>(null);
  const canvasReadyRef = useRef(false);
  const entryRevealStartedRef = useRef(false);
  const entryRevealTimerRef = useRef<number | null>(null);
  const syncingDesignIdsRef = useRef(new Set<string>());

  // Modals State
  const [newDesignModalOpen, setNewDesignModalOpen] = useState<boolean>(false);
  const [initialPreset, setInitialPreset] = useState<PresetSize | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState<boolean>(false);
  const [renameTarget, setRenameTarget] = useState<Design | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Design | null>(null);
  const [stylePickerOpen, setStylePickerOpen] = useState<boolean>(false);

  // Hidden File Input Ref for Open File
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load local data immediately, then probe the optional backend without blocking the app.
  useEffect(() => {
    const initializeData = async () => {
      try {
        const loadedSettings = await storage.getSettings();
        const loadedDesigns = await storage.getAllDesigns();
        setSettings(loadedSettings);
        setDesigns(loadedDesigns);
      } catch (e) {
        console.error('Failed to initialize local data:', e);
      } finally {
        setIsLoading(false);
      }

      if (!api.configured) {
        setBackendStatus('disabled');
        return;
      }

      try {
        const config = await api.getConfig();
        setBackendConfig(config);
        setBackendStatus('online');
        const session = await api.refreshSession();
        if (session) {
          setSessionUser(session.user);
          try { setAccount(await api.getAccount()); }
          catch (error) { console.warn('Could not load cloud account details:', error); }
          try {
            const remoteConsent = await api.getConsent();
            const consentUpdates: Partial<AppSettings> = {};
            for (const consent of remoteConsent.consents) {
              if (consent.purpose === 'critique') consentUpdates.aiReviewConsent = consent.decision === 'granted';
              if (consent.purpose === 'learning') consentUpdates.learningDataConsent = consent.decision === 'granted';
            }
            if (Object.keys(consentUpdates).length > 0) setSettings(await storage.saveSettings(consentUpdates));
          } catch (error) { console.warn('Could not load cloud consent:', error); }
          try {
            const remoteDesigns = await pullRemoteDesigns();
            if (remoteDesigns.length > 0) {
              setDesigns((localDesigns) => {
                const remoteById = new Map(remoteDesigns.map((design) => [design.remoteId, design]));
                const merged = localDesigns.map((local) => {
                  const remote = local.remoteId ? remoteById.get(local.remoteId) : undefined;
                  if (remote) remoteById.delete(local.remoteId);
                  if (!remote || (local.remoteVersion ?? 0) >= (remote.remoteVersion ?? 0)) return local;
                  return remote;
                });
                return [...merged, ...Array.from(remoteById.values())];
              });
              await Promise.all(remoteDesigns.map((design) => storage.saveDesign(design)));
            }
          } catch (error) {
            console.warn('Could not pull remote designs:', error);
          }
        } else {
          setSessionUser(null);
          setAccount(null);
        }
      } catch (error) {
        setBackendStatus('offline');
        setSessionUser(null);
        setAccount(null);
        if (!(error instanceof BackendUnavailableError)) console.warn('Backend health check failed:', error);
      }
    };
    initializeData();
  }, []);

  // Complete a magic-link login when the backend redirects back to the app.
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token');
    if (!token || !api.configured) return;

    api.verifyMagicLink(token)
      .then((session) => {
        setSessionUser(session.user);
        void api.getAccount().then(setAccount).catch((error) => console.warn('Could not load cloud account details:', error));
        void api.getConsent().then(async (remoteConsent) => {
          const consentUpdates: Partial<AppSettings> = {};
          for (const consent of remoteConsent.consents) {
            if (consent.purpose === 'critique') consentUpdates.aiReviewConsent = consent.decision === 'granted';
            if (consent.purpose === 'learning') consentUpdates.learningDataConsent = consent.decision === 'granted';
          }
          if (Object.keys(consentUpdates).length > 0) setSettings(await storage.saveSettings(consentUpdates));
        }).catch((error) => console.warn('Could not load cloud consent:', error));
        setBackendStatus('online');
        setAuthModalOpen(false);
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
      })
      .catch((error) => console.error('Magic-link verification failed:', error));
  }, []);

  // Anonymous share links use a fragment so the token is never sent to a server.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash.length >= 20 && !hash.startsWith('token=') && !hash.includes('=')) {
      setSharedDesignToken(hash);
    }
  }, []);

  // Navigation history handler
  const navigateTo = (dest: NavigationDestination) => {
    if (dest === currentDestination) return;
    const newStack = historyStack.slice(0, historyIndex + 1);
    newStack.push(dest);
    setHistoryStack(newStack);
    setHistoryIndex(newStack.length - 1);
    setCurrentDestination(dest);
  };

  const handleBack = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setCurrentDestination(historyStack[prevIndex]);
    }
  };

  const handleForward = () => {
    if (historyIndex < historyStack.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setCurrentDestination(historyStack[nextIndex]);
    }
  };

  // Keyboard shortcuts (⌘N, ⌘O, ⌘S, ⌘E, ⌘K, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setInitialPreset(null);
        setNewDesignModalOpen(true);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        fileInputRef.current?.click();
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activeDesignId) {
          const d = designs.find((x) => x.id === activeDesignId);
          if (d) {
            storage.saveDesign(d);
            setSaveStatus('saved');
          }
        }
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (activeDesignId) setExportModalOpen(true);
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShortcutsModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDesignId, designs]);

  // Periodic autosave for active design
  const activeDesign = designs.find((d) => d.id === activeDesignId) || null;

  const syncDesignInBackground = async (design: Design) => {
    if (!sessionUser || !api.authenticated || syncingDesignIdsRef.current.has(design.id)) return;
    syncingDesignIdsRef.current.add(design.id);
    try {
      const synced = await syncDesign(design);
      await storage.saveDesign(synced);
      setDesigns((prev) => prev.map((item) => (item.id === synced.id ? synced : item)));
      setBackendStatus('online');
    } catch (error) {
      if (error instanceof BackendUnavailableError) setBackendStatus('offline');
      else console.warn('Design sync failed:', error);
      setDesigns((prev) => prev.map((item) => (item.id === design.id ? { ...item, syncStatus: 'error' } : item)));
    } finally {
      syncingDesignIdsRef.current.delete(design.id);
    }
  };

  const handleExportAccount = async () => {
    const job = await api.startAccountExport();
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const status = await api.getAccountExport(job.id);
      if (status.status === 'done') {
        const blob = await api.downloadAccountExport(job.id);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `zenopher-cloud-export-${new Date().toISOString().slice(0, 10)}.tar`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return;
      }
      if (status.status === 'failed') throw new Error('The cloud export job failed.');
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    throw new Error('The export is still processing. Please try again from Settings shortly.');
  };

  const handleScheduleAccountDeletion = async () => {
    const confirmation = window.prompt('To schedule deletion, type: delete my account');
    if (confirmation !== 'delete my account') return;
    const updated = await api.scheduleAccountDeletion();
    setAccount((previous) => previous ? { ...previous, status: updated.status, deletion_at: updated.deletion_at } : previous);
  };

  const handleCancelAccountDeletion = async () => {
    await api.cancelAccountDeletion();
    setAccount((previous) => previous ? { ...previous, status: 'active', deletion_at: null } : previous);
  };

  const handleRequestCloudCritique = async () => {
    if (!activeDesign) throw new Error('Open a design before requesting a critique.');
    const image = await renderDesignToPng(activeDesign, backendConfig?.limits.critique_max_image_px ?? 1024);
    const style = activeDesign.styleId ? STYLE_PROFILES.find((profile) => profile.id === activeDesign.styleId) : null;
    const metadata = {
      page: {
        width_px: activeDesign.width,
        height_px: activeDesign.height,
        mode: activeDesign.styleId ? 'corporate_full' as const : 'corporate_base' as const,
        style_name: style?.name ?? null,
      },
      findings: findings.map((finding, index) => ({
        rule: (finding.id.replace(/[^a-z0-9_.]/gi, '_').toLowerCase() || `finding_${index}`).slice(0, 40),
        class: finding.confidence === 'must' ? 'base' as const : 'pattern' as const,
        severity: finding.confidence,
        measured: finding.currentValue.slice(0, 20),
        expected: finding.requiredValue.slice(0, 30),
      })),
    };
    return api.requestCritique(image, metadata);
  };

  const cloudReviewAvailable = Boolean(
    sessionUser
    && api.authenticated
    && backendStatus === 'online'
    && backendConfig?.features.critique
    && settings.aiReviewConsent,
  );

  const handleOpenShare = async () => {
    if (!activeDesign) return;
    if (!sessionUser) {
      setAuthModalOpen(true);
      return;
    }
    try {
      const synced = activeDesign.remoteId && (activeDesign.remoteVersion ?? 0) > 0
        ? activeDesign
        : await syncDesign(activeDesign);
      if (synced !== activeDesign) {
        await storage.saveDesign(synced);
        setDesigns((prev) => prev.map((item) => item.id === synced.id ? synced : item));
      }
      setShareModalOpen(true);
    } catch (error) {
      alert(`Could not prepare this design for sharing: ${(error as Error).message}`);
    }
  };

  useEffect(() => {
    if (!activeDesign) return;

    const intervalMs = (settings.autosaveInterval || 15) * 1000;
    const timer = setInterval(() => {
      setSaveStatus('saving');
      storage.saveDesign(activeDesign).then(() => {
        void syncDesignInBackground(activeDesign);
        setTimeout(() => setSaveStatus('saved'), 400);
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [activeDesign, settings.autosaveInterval, sessionUser]);

  // Design Management Actions
  const handleCreateDesign = async (data: {
    title: string;
    width: number;
    height: number;
    unit: Unit;
    mode: DesignMode;
    styleId?: string;
    layers?: Layer[];
  }) => {
    const fallbackLayers: Layer[] = [
        {
          id: 'layer-heading',
          name: 'Primary Title',
          type: 'text',
          x: Math.round(data.width * 0.1),
          y: Math.round(data.height * 0.15),
          width: Math.round(data.width * 0.8),
          height: 100,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 1,
          fill: '#FFFFFF',
          text: data.title,
          fontSize: Math.max(28, Math.min(64, Math.round(data.width * 0.05))),
          fontFamily: data.styleId === 'cyber-brutalist' ? 'JetBrains Mono' : data.styleId === 'editorial-luxe' ? 'Georgia' : 'Lufga',
          fontWeight: '700',
          textAlign: 'left',
        },
        {
          id: 'layer-subhead',
          name: 'Subtitle Copy',
          type: 'text',
          x: Math.round(data.width * 0.1),
          y: Math.round(data.height * 0.15) + 110,
          width: Math.round(data.width * 0.7),
          height: 60,
          rotation: 0,
          visible: true,
          locked: false,
          opacity: 0.7,
          fill: '#FFFFFF',
          text: 'Constructed with monochrome geometry in Zenopher.',
          fontSize: 16,
          fontFamily: 'Lufga',
          fontWeight: '400',
          textAlign: 'left',
        },
      ];
    const templateLayers = (data.layers ?? [])
      .filter((l) => l && typeof l.id === 'string' && typeof l.type === 'string')
      .map((l, i) => ({
        id: typeof l.id === 'string' && l.id ? l.id : `layer-template-${i}`,
        name: (l as Layer).name || `Layer ${i + 1}`,
        type: (l as Layer).type,
        x: Number((l as Layer).x) || 0,
        y: Number((l as Layer).y) || 0,
        width: Math.max(1, Number((l as Layer).width) || 100),
        height: Math.max(1, Number((l as Layer).height) || 100),
        rotation: Number((l as Layer).rotation) || 0,
        visible: (l as Layer).visible !== false,
        locked: Boolean((l as Layer).locked),
        opacity: Number.isFinite(Number((l as Layer).opacity)) ? Number((l as Layer).opacity) : 1,
        fill: (l as Layer).fill ?? '#FFFFFF',
        stroke: (l as Layer).stroke,
        strokeWidth: (l as Layer).strokeWidth,
        borderRadius: (l as Layer).borderRadius,
        text: (l as Layer).text,
        fontSize: (l as Layer).fontSize,
        fontFamily: (l as Layer).fontFamily ?? 'Lufga',
        fontWeight: (l as Layer).fontWeight,
        textAlign: (l as Layer).textAlign,
        letterSpacing: (l as Layer).letterSpacing,
        lineHeight: (l as Layer).lineHeight,
        imageUrl: (l as Layer).imageUrl,
        assetId: (l as Layer).assetId,
      } as Layer));
    const newDesign: Design = {
      id: 'design-' + Math.random().toString(36).substring(2, 9),
      title: data.title || 'Untitled Design',
      width: data.width,
      height: data.height,
      unit: data.unit,
      mode: data.mode,
      styleId: data.styleId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isSaved: true,
      isDeleted: false,
      background: '#111111',
      layers: templateLayers.length > 0 ? templateLayers : fallbackLayers,
    };

    await storage.saveDesign(newDesign);
    setDesigns((prev) => [newDesign, ...prev]);
    void syncDesignInBackground(newDesign);
    setActiveDesignId(newDesign.id);
    setSelectedLayerId(null);
    setEditorSidebarExpanded(false);
    navigateTo('editor');
  };

  const handleOpenPreset = (preset: PresetSize) => {
    setInitialPreset(preset);
    setNewDesignModalOpen(true);
  };

  const finishEditorEntry = () => {
    if (entryRevealStartedRef.current) return;
    entryRevealStartedRef.current = true;
    entryRevealTimerRef.current = null;
    setEditorEntryPhase('revealing');
    window.setTimeout(() => {
      setEditorEntryPhase('idle');
      setOpeningDesignId(null);
      setEditorEntryRect(null);
      setEditorEntryTargetRect(null);
    }, 480);
  };

  const scheduleEditorReveal = () => {
    if (entryRevealStartedRef.current || entryRevealTimerRef.current !== null) return;
    entryRevealTimerRef.current = window.setTimeout(finishEditorEntry, 1000);
  };

  const handleOpenDesign = async (design: Design, _sourceRect?: DOMRect) => {
    if (openingDesignId) return;

    // Touch updatedAt for recents tracking
    const updated = { ...design, updatedAt: Date.now() };
    const topBarBottom = document.querySelector('.top-bar')?.getBoundingClientRect().bottom ?? 0;
    const fullWorkspaceRect = {
      left: 0,
      top: topBarBottom,
      width: window.innerWidth,
      height: Math.max(0, window.innerHeight - topBarBottom),
      borderRadius: 0,
    };
    setEditorEntryRect(fullWorkspaceRect);
    setEditorEntryTargetRect(fullWorkspaceRect);
    setOpeningDesignId(design.id);
    setEditorSidebarExpanded(false);
    canvasReadyRef.current = false;
    entryRevealStartedRef.current = false;
    if (entryRevealTimerRef.current !== null) {
      window.clearTimeout(entryRevealTimerRef.current);
      entryRevealTimerRef.current = null;
    }

    // Failsafe: never trap the user behind the entry curtain. If the canvas
    // never signals ready (blocked iframe, missing /photocraft bundle, no
    // WebGPU), lift the curtain after 8s so the error state is visible.
    entryRevealTimerRef.current = window.setTimeout(() => {
      entryRevealTimerRef.current = null;
      finishEditorEntry();
    }, 8000);

    void Promise.all([
      storage.saveDesign(updated),
      preloadDesignAssets(updated),
    ]).catch((error) => console.error('Failed to preload design:', error));

    setDesigns((prev) => prev.map((d) => (d.id === design.id ? updated : d)));
    setActiveDesignId(design.id);
    setSelectedLayerId(null);
    setEditorEntryPhase('covered');
    navigateTo('editor');
  };

  const handleCanvasReady = () => {
    canvasReadyRef.current = true;
    if (editorEntryPhase === 'covered') scheduleEditorReveal();
  };

  const handleUpdateActiveDesign = (updates: Partial<Design>) => {
    if (!activeDesignId) return;
    setDesigns((prev) =>
      prev.map((d) => {
        if (d.id !== activeDesignId) return d;
        const updated = { ...d, ...updates, updatedAt: Date.now() };
        storage.saveDesign(updated);
        return updated;
      })
    );
  };

  const handleUpdateLayer = (layerId: string, updates: Partial<Layer>) => {
    if (!activeDesign) return;
    const updatedLayers = activeDesign.layers.map((l) => (l.id === layerId ? { ...l, ...updates } : l));
    handleUpdateActiveDesign({ layers: updatedLayers });
  };

  const handleAddLayer = (type: LayerType) => {
    if (!activeDesign) return;
    const count = activeDesign.layers.filter((l) => l.type === type).length + 1;
    const newLayer: Layer = {
      id: `layer-${Math.random().toString(36).substring(2, 9)}`,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${count}`,
      type,
      x: Math.round(activeDesign.width / 2 - 120),
      y: Math.round(activeDesign.height / 2 - 80),
      width: type === 'text' ? 300 : 240,
      height: type === 'text' ? 60 : 160,
      rotation: 0,
      visible: true,
      locked: false,
      opacity: 1,
      fill: type === 'text' ? '#FFFFFF' : '#2C2C2C',
      borderRadius: type === 'rect' ? 18 : undefined,
      text: type === 'text' ? 'New typography block' : undefined,
      fontSize: type === 'text' ? 24 : undefined,
      fontFamily: 'Lufga',
      fontWeight: '500',
    };

    handleUpdateActiveDesign({ layers: [...activeDesign.layers, newLayer] });
    setSelectedLayerId(newLayer.id);
  };

  const handleDeleteLayer = (layerId: string) => {
    if (!activeDesign) return;
    const updatedLayers = activeDesign.layers.filter((l) => l.id !== layerId);
    handleUpdateActiveDesign({ layers: updatedLayers });
    if (selectedLayerId === layerId) setSelectedLayerId(null);
  };

  const handleReorderLayer = (layerId: string, direction: 'up' | 'down') => {
    if (!activeDesign) return;
    const idx = activeDesign.layers.findIndex((l) => l.id === layerId);
    if (idx < 0) return;

    const layersCopy = [...activeDesign.layers];
    if (direction === 'up' && idx < layersCopy.length - 1) {
      const temp = layersCopy[idx];
      layersCopy[idx] = layersCopy[idx + 1];
      layersCopy[idx + 1] = temp;
    } else if (direction === 'down' && idx > 0) {
      const temp = layersCopy[idx];
      layersCopy[idx] = layersCopy[idx - 1];
      layersCopy[idx - 1] = temp;
    }
    handleUpdateActiveDesign({ layers: layersCopy });
  };

  const handleDeleteDesign = async (id: string) => {
    const design = designs.find((item) => item.id === id);
    await storage.moveToTrash(id);
    setDesigns((prev) => prev.map((d) => (d.id === id ? { ...d, isDeleted: true, deletedAt: Date.now() } : d)));
    if (design?.remoteId && sessionUser) {
      void api.moveDesignToTrash(design.remoteId).catch((error) => console.warn('Could not move remote design to trash:', error));
    }
    if (activeDesignId === id) {
      setActiveDesignId(null);
      setSelectedLayerId(null);
      navigateTo('home');
    }
  };

  const handleRestoreDesign = async (id: string) => {
    const design = designs.find((item) => item.id === id);
    await storage.restoreFromTrash(id);
    setDesigns((prev) => prev.map((d) => (d.id === id ? { ...d, isDeleted: false, deletedAt: undefined } : d)));
    if (design?.remoteId && sessionUser) {
      void api.restoreDesign(design.remoteId).catch((error) => console.warn('Could not restore remote design:', error));
    }
  };

  const handleDeletePermanently = async (id: string) => {
    const design = designs.find((item) => item.id === id);
    await storage.deletePermanently(id);
    setDesigns((prev) => prev.filter((d) => d.id !== id));
    if (design?.remoteId && sessionUser) {
      void api.permanentlyDeleteDesign(design.remoteId).catch((error) => console.warn('Could not delete remote design:', error));
    }
  };

  const handleEmptyTrash = async () => {
    const remoteIds = designs.filter((design) => design.isDeleted && design.remoteId).map((design) => design.remoteId as string);
    await storage.emptyTrash();
    setDesigns((prev) => prev.filter((d) => !d.isDeleted));
    if (sessionUser) {
      await Promise.all(remoteIds.map((remoteId) => api.permanentlyDeleteDesign(remoteId).catch((error) => console.warn('Could not delete remote design:', error))));
    }
  };

  const handleDuplicateDesign = async (design: Design) => {
    const duplicated: Design = {
      ...design,
      id: 'design-' + Math.random().toString(36).substring(2, 9),
      title: `${design.title} (Copy)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false,
      remoteId: undefined,
      remoteVersion: undefined,
      syncStatus: 'local',
    };
    await storage.saveDesign(duplicated);
    setDesigns((prev) => [duplicated, ...prev]);
    void syncDesignInBackground(duplicated);
  };

  const handleRenameDesign = async (id: string, newTitle: string) => {
    const d = designs.find((x) => x.id === id);
    if (d) {
      const updated = { ...d, title: newTitle, updatedAt: Date.now() };
      await storage.saveDesign(updated);
      setDesigns((prev) => prev.map((x) => (x.id === id ? updated : x)));
      if (d.remoteId && sessionUser) {
        void api.updateDesign(d.remoteId, { title: newTitle, mode: updated.mode, styleId: undefined })
          .catch((error) => console.warn('Could not rename remote design:', error));
      }
    }
  };

  // Open file handler (.zph, PNG, PSD)
  const handleOpenFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.toLowerCase().endsWith('.zph') || file.type === 'application/json') {
        const imported = await storage.importZPH(file);
        setDesigns((prev) => [imported, ...prev]);
        void syncDesignInBackground(imported);
        handleOpenDesign(imported);
      } else if (file.type.startsWith('image/')) {
        const imageUrl = await readFileAsDataUrl(file);
        const { width, height } = await readImageDimensions(imageUrl);
        const newDesign: Design = {
          id: 'design-' + Math.random().toString(36).substring(2, 9),
          title: file.name.replace(/\.[^/.]+$/, ''),
          width,
          height,
          unit: 'px',
          mode: 'creative',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isSaved: true,
          isDeleted: false,
          background: '#000000',
          layers: [
            {
              id: 'layer-imported-img',
              name: 'Imported Graphic',
              type: 'image',
              x: 0,
              y: 0,
              width,
              height,
              rotation: 0,
              visible: true,
              locked: false,
              opacity: 1,
              fill: '#FFFFFF',
              imageUrl,
            },
          ],
        };
        await storage.saveDesign(newDesign);
        setDesigns((prev) => [newDesign, ...prev]);
        void syncDesignInBackground(newDesign);
        handleOpenDesign(newDesign);
      } else {
        throw new Error('Unsupported file type. Choose a .zph, JSON, PNG, JPEG, or SVG file.');
      }
    } catch (err) {
      alert('Could not open file: ' + (err as Error).message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Corporate review is powered by the Rust teacher in zenopher-teacher.
  const teacher = useRustTeacher(
    activeDesign,
    api.baseUrl,
    settings.learningDataConsent,
    handleUpdateActiveDesign,
    (ids) => setSelectedLayerId(ids[0] ?? null),
  );
  const findings = teacher.findings;

  const handleApplyFix = (finding: ReviewFinding) => {
    void teacher.applyFix(finding);
  };

  const handleApplyAllFixes = () => {
    void teacher.applyAllFixes();
  };

  // Context Title calculation
  const getContextTitle = () => {
    if (currentDestination === 'editor' && activeDesign) {
      return activeDesign.title;
    }
    switch (currentDestination) {
      case 'home': return 'Home';
      case 'designs': return 'Designs';
      case 'templates': return 'Templates';
      case 'trash': return 'Trash';
      case 'styles': return 'Style Library';
      case 'tutorials': return 'Tutorials';
      case 'settings': return 'Settings';
      case 'privacy': return 'Privacy';
      case 'legal': return 'Legal';
      case 'help': return 'Help';
      default: return 'Zenopher';
    }
  };

  // Filtered designs for Home view
  const recentDesigns = designs
    .filter((d) => !d.isDeleted)
    .filter((d) => !searchQuery.trim() || d.title.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const savedDesigns = designs
    .filter((d) => !d.isDeleted && d.isSaved)
    .filter((d) => !searchQuery.trim() || d.title.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);

  const trashDesigns = designs.filter((d) => d.isDeleted);

  const selectedLayer = activeDesign?.layers.find((l) => l.id === selectedLayerId) || null;

  if (sharedDesignToken) {
    return (
      <SharedDesignView
        token={sharedDesignToken}
        onClose={() => {
          setSharedDesignToken(null);
          window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        <span className="loading-mark">Z</span>
        <span>Loading your local workspace…</span>
      </div>
    );
  }

  return (
    <div className={`app-shell${currentDestination === 'editor' ? ' editor-mode' : ''}${currentDestination === 'editor' && editorSidebarExpanded ? ' editor-sidebar-expanded' : ''}${currentDestination === 'editor' && editorEntryPhase === 'covered' ? ' editor-entry-covered' : ''}`}>
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".zph,.json,image/png,image/jpeg,image/svg+xml,.psd"
        onChange={handleFileChange}
      />

      {/* 1. Floating Navigation Rail */}
      <NavigationRail
        currentDestination={currentDestination}
        onNavigate={navigateTo}
        profileName={settings.profileName}
        editorSidebarExpanded={editorSidebarExpanded}
        onToggleEditorSidebar={() => setEditorSidebarExpanded((expanded) => !expanded)}
      />

      {/* 2. Main Area */}
      <div className="main-area">
        {/* Floating Top Bar */}
        <TopBar
          currentDestination={currentDestination}
          contextTitle={getContextTitle()}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          canGoBack={historyIndex > 0}
          canGoForward={historyIndex < historyStack.length - 1}
          onBack={handleBack}
          onForward={handleForward}
          onNewDesign={() => {
            setInitialPreset(null);
            setNewDesignModalOpen(true);
          }}
          onOpenFile={handleOpenFile}
          activeDesign={activeDesign}
          onExport={() => setExportModalOpen(true)}
          onShare={() => void handleOpenShare()}
          onOpenShortcuts={() => setShortcutsModalOpen(true)}
          onToggleEditorMode={(m) => handleUpdateActiveDesign({ mode: m })}
          onOpenStylePicker={() => setStylePickerOpen(true)}
          saveStatus={saveStatus}
        />

        {/* Workspace Display Area */}
        {currentDestination === 'editor' && activeDesign ? (
          <div className={`editor-workspace photocraft-editor-workspace${activeDesign.mode === 'creative' ? ' creative-mode-workspace' : ' corporate-mode-workspace'}`}>
            <PhotoCraftWasmWorkspace
              design={activeDesign}
              toolProfile={activeDesign.mode}
              onCanvasReady={handleCanvasReady}
              onDesignChange={(updates) => handleUpdateActiveDesign(updates)}
              onUndo={() => void teacher.noteUndo()}
              onGestureStart={() => teacher.gestureStart()}
              onGestureEnd={() => teacher.gestureEnd()}
            />
            {activeDesign.mode === 'corporate' && (
              <aside className="floating-panel teacher-review-panel" aria-label="Design review">
                {(teacher.loading || teacher.error || teacher.styleMessage || teacher.unavailable.length > 0) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {teacher.loading && <span>Checking your design…</span>}
                    {teacher.error && <span role="alert">{teacher.error}</span>}
                    {teacher.styleMessage && <span>{teacher.styleMessage}</span>}
                    {teacher.unavailable.length > 0 && (
                      <span>Some checks could not run on this page: {teacher.unavailable.join(', ')}.</span>
                    )}
                  </div>
                )}
                <ReviewPanel
                  design={activeDesign}
                  findings={findings}
                  onApplyFix={handleApplyFix}
                  onApplyAllFixes={handleApplyAllFixes}
                  onOpenStylePicker={() => setStylePickerOpen(true)}
                  onRequestCloudCritique={handleRequestCloudCritique}
                  cloudReviewAvailable={cloudReviewAvailable}
                />
              </aside>
            )}
          </div>
        ) : currentDestination === 'home' ? (
          <HomeView
            profileName={settings.profileName}
            isFirstLaunch={designs.length <= 3}
            recentDesigns={recentDesigns}
            savedDesigns={savedDesigns}
            onNewDesign={() => {
              setInitialPreset(null);
              setNewDesignModalOpen(true);
            }}
            onOpenPreset={handleOpenPreset}
            onOpenDesign={handleOpenDesign}
            onOpenFile={handleOpenFile}
            onNavigate={navigateTo}
            onDeleteDesign={(id) => {
              const d = designs.find((x) => x.id === id);
              if (d) setDeleteTarget(d);
            }}
            onDuplicateDesign={handleDuplicateDesign}
            onRenameDesign={(d) => setRenameTarget(d)}
            onExportDesign={(d) => storage.exportZPH(d)}
            loadingDesignId={openingDesignId}
          />
        ) : currentDestination === 'designs' ? (
          <DesignsView
            designs={designs}
            searchQuery={searchQuery}
            onOpenDesign={handleOpenDesign}
            onNewDesign={() => {
              setInitialPreset(null);
              setNewDesignModalOpen(true);
            }}
            onDeleteDesign={(id) => {
              const d = designs.find((x) => x.id === id);
              if (d) setDeleteTarget(d);
            }}
            onDuplicateDesign={handleDuplicateDesign}
            onRenameDesign={(d) => setRenameTarget(d)}
            onExportDesign={(d) => storage.exportZPH(d)}
            loadingDesignId={openingDesignId}
          />
        ) : currentDestination === 'templates' ? (
          <TemplatesView
            onOpenPreset={handleOpenPreset}
            onUseTemplate={(t) => {
              handleCreateDesign({
                title: t.name,
                width: t.width,
                height: t.height,
                unit: 'px',
                mode: t.mode,
                styleId: t.styleId,
                layers: t.layers as Layer[],
              });
            }}
          />
        ) : currentDestination === 'trash' ? (
          <TrashView
            trashDesigns={trashDesigns}
            onRestore={handleRestoreDesign}
            onDeletePermanently={handleDeletePermanently}
            onEmptyTrash={handleEmptyTrash}
          />
        ) : currentDestination === 'styles' ? (
          <StylesView
            onSelectStyleForNewDesign={(style) => {
              handleCreateDesign({
                title: `${style.name} Composition`,
                width: 1080,
                height: 1080,
                unit: 'px',
                mode: 'corporate',
                styleId: style.id,
              });
            }}
          />
        ) : currentDestination === 'tutorials' ? (
          <TutorialsView />
        ) : currentDestination === 'settings' ? (
          <SettingsView
            settings={settings}
            sessionUser={sessionUser}
            backendStatus={backendStatus}
            onSignIn={() => setAuthModalOpen(true)}
            onSignOut={async () => {
              await api.signOut();
              setSessionUser(null);
              setAccount(null);
            }}
            account={account}
            onExportAccount={async () => {
              try { await handleExportAccount(); }
              catch (error) { alert(`Could not export cloud data: ${(error as Error).message}`); }
            }}
            onScheduleDeletion={async () => {
              try { await handleScheduleAccountDeletion(); }
              catch (error) { alert(`Could not schedule account deletion: ${(error as Error).message}`); }
            }}
            onCancelDeletion={async () => {
              try { await handleCancelAccountDeletion(); }
              catch (error) { alert(`Could not cancel account deletion: ${(error as Error).message}`); }
            }}
            onUpdateSettings={async (updated) => {
              const res = await storage.saveSettings(updated);
              setSettings(res);
              if (sessionUser && updated.profileName && updated.profileName !== sessionUser.display_name) {
                try {
                  await api.updateAccount(updated.profileName);
                  setSessionUser({ ...sessionUser, display_name: updated.profileName });
                } catch (error) {
                  console.warn('Could not update cloud profile:', error);
                }
              }
            }}
          />
        ) : currentDestination === 'privacy' ? (
          <PrivacyView
            settings={settings}
            sessionUser={Boolean(sessionUser)}
            onSyncConsent={async (purpose, granted) => {
              await api.setConsent(purpose, granted ? 'granted' : 'withdrawn', 'policy-v1');
            }}
            onUpdateSettings={async (updated) => {
              const res = await storage.saveSettings(updated);
              setSettings(res);
            }}
            onDataReset={async () => {
              setDesigns([]);
              setSettings(DEFAULT_SETTINGS);
              setActiveDesignId(null);
              setSelectedLayerId(null);
              setHistoryStack(['home']);
              setHistoryIndex(0);
              setCurrentDestination('home');
            }}
          />
        ) : currentDestination === 'legal' ? (
          <LegalView />
        ) : currentDestination === 'help' ? (
          <HelpView onOpenShortcuts={() => setShortcutsModalOpen(true)} />
        ) : null}
      </div>

      {editorEntryPhase !== 'idle' && editorEntryRect && (
        <div
          className={`editor-entry-curtain is-${editorEntryPhase}`}
          style={{
            left: `${(editorEntryPhase === 'ready' ? editorEntryRect : editorEntryTargetRect ?? editorEntryRect).left}px`,
            top: `${(editorEntryPhase === 'ready' ? editorEntryRect : editorEntryTargetRect ?? editorEntryRect).top}px`,
            width: `${(editorEntryPhase === 'ready' ? editorEntryRect : editorEntryTargetRect ?? editorEntryRect).width}px`,
            height: `${(editorEntryPhase === 'ready' ? editorEntryRect : editorEntryTargetRect ?? editorEntryRect).height}px`,
            borderRadius: `${(editorEntryPhase === 'ready' ? editorEntryRect : editorEntryTargetRect ?? editorEntryRect).borderRadius}px`,
          }}
          aria-hidden="true"
        >
          <div className="editor-entry-loader">
            <span className="canvas-loader-ring" />
            <span>Opening canvas</span>
          </div>
        </div>
      )}

      {/* Popups and Modals */}
      <NewDesignModal
        isOpen={newDesignModalOpen}
        initialPreset={initialPreset}
        defaultMode={settings.defaultMode}
        defaultStyle={settings.defaultStyle}
        onClose={() => setNewDesignModalOpen(false)}
        onCreateDesign={handleCreateDesign}
      />

      {activeDesign && (
        <ExportModal
          isOpen={exportModalOpen}
          design={activeDesign}
          onClose={() => setExportModalOpen(false)}
        />
      )}

      <ShortcutsModal
        isOpen={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />

      <RenameModal
        isOpen={!!renameTarget}
        design={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRename={handleRenameDesign}
      />

      <DeleteConfirmModal
        isOpen={!!deleteTarget}
        design={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteDesign}
      />

      <StylePickerModal
        isOpen={stylePickerOpen}
        currentStyleId={activeDesign?.styleId}
        onClose={() => setStylePickerOpen(false)}
        onSelectStyle={(sId) => handleUpdateActiveDesign({ styleId: sId })}
      />

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onRequestMagicLink={(email) => api.requestMagicLink(email)}
      />

      {activeDesign?.remoteId && (
        <ShareModal
          isOpen={shareModalOpen}
          designTitle={activeDesign.title}
          onClose={() => setShareModalOpen(false)}
          onCreateShare={(input) => api.createShare(activeDesign.remoteId!, input)}
          onListShares={async () => (await api.listShares(activeDesign.remoteId!)).shares}
          onRevokeShare={(shareId) => api.revokeShare(activeDesign.remoteId!, shareId)}
        />
      )}

      {/* Plain text Offline Status Banner */}
      <OfflineBanner backendStatus={backendStatus} storageFull={backendConfig?.features.storage_available === false} />
    </div>
  );
};

