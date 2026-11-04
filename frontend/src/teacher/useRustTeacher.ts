import { useCallback, useEffect, useRef, useState } from 'react';
import type { Design, Layer, ReviewFinding } from '../types';
import { renderDesignToPng } from '../services/render';
import type { WasmTeacher } from './generated/zenopher_teacher';
import { TeacherBridge } from '../../../zenopher-teacher/web/src/teacher/bridge';
import { CatalogSync } from '../../../zenopher-teacher/web/src/teacher/catalogSync';
import { EventRecorder } from '../../../zenopher-teacher/web/src/teacher/eventRecorder';
import type { FindingView, TeacherHost } from '../../../zenopher-teacher/web/src/teacher/types';
import { teacherPaint } from './reviewPaint';
import { WorkerTeacherBridge } from './WorkerTeacherBridge';
import type { RunTeacherCommands } from '../components/editor/teacherCommands';
import { layerRevision as stableLayerVersion } from '../services/designState';

const ACCESS_TOKEN_KEY = 'zenopher_access_token';
let teacherModule: Promise<typeof import('./generated/zenopher_teacher')> | null = null;
function loadTeacher() {
  if (!teacherModule) {
    teacherModule = import('./generated/zenopher_teacher').then(async (module) => {
      await module.default();
      return module;
    });
    void teacherModule.catch(() => { teacherModule = null; });
  }
  return teacherModule;
}

type RustColor = { r: number; g: number; b: number; a: number };
type RustFinding = FindingView['finding'];

function colorFromHex(value: string | undefined): RustColor {
  const hex = (value ?? '#000000').replace('#', '');
  const normalized = hex.length === 3 ? hex.split('').map((part) => part + part).join('') : hex;
  // 8-digit #rrggbbaa carries alpha (PhotoCraft exports it); 6-digit is opaque.
  if (/^[0-9a-f]{8}$/i.test(normalized)) {
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16) / 255,
      g: Number.parseInt(normalized.slice(2, 4), 16) / 255,
      b: Number.parseInt(normalized.slice(4, 6), 16) / 255,
      a: Number.parseInt(normalized.slice(6, 8), 16) / 255,
    };
  }
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return { r: 0, g: 0, b: 0, a: 1 };
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16) / 255,
    g: Number.parseInt(normalized.slice(2, 4), 16) / 255,
    b: Number.parseInt(normalized.slice(4, 6), 16) / 255,
    a: 1,
  };
}

function toPx(value: number, unit: Design['unit']): number {
  if (!Number.isFinite(value)) return 0;
  if (unit === 'mm') return value * (96 / 25.4);
  if (unit === 'in') return value * 96;
  return value;
}

const imageNaturalSizeCache = new Map<string, { w: number; h: number }>();
const pendingImageSizes = new Set<string>();
let activeImageSources = new Set<string>();

function preloadImageSizes(layers: Layer[], onReady: () => void): void {
  if (typeof Image === 'undefined') return;
  activeImageSources = new Set(layers.flatMap((layer) => layer.type === 'image' && layer.imageUrl ? [layer.imageUrl] : []));
  for (const url of imageNaturalSizeCache.keys()) {
    if (!activeImageSources.has(url)) imageNaturalSizeCache.delete(url);
  }
  for (const layer of layers) {
    if (layer.type !== 'image' || !layer.imageUrl) continue;
    if (imageNaturalSizeCache.has(layer.imageUrl)) continue;
    const url = layer.imageUrl;
    if (pendingImageSizes.has(url)) continue;
    pendingImageSizes.add(url);
    const img = new Image();
    img.onload = () => {
      pendingImageSizes.delete(url);
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      if (w > 0 && h > 0 && activeImageSources.has(url)) {
        imageNaturalSizeCache.set(url, { w, h });
        onReady();
      }
    };
    img.onerror = () => { pendingImageSizes.delete(url); };
    img.src = url;
  }
}

export function snapshotFor(design: Design, ids: Map<string, number>): string {
  const layers = design.layers.map((layer) => {
    const paint = teacherPaint(layer);
    const numeric = ids.get(layer.id);
    // Never emit id 0: unknown layers get a skipped placeholder that rules ignore
    // via visible=false would hide them — instead assign is handled by caller.
    // Here we fall back to a deterministic hash so keys stay stable.
    const id = numeric ?? (stableLayerVersion(layer) % 2000000) + 1;
    const x = toPx(layer.x, design.unit);
    const y = toPx(layer.y, design.unit);
    const w = toPx(layer.width, design.unit);
    const h = toPx(layer.height, design.unit);
    const sizePx = toPx(layer.fontSize ?? 16, design.unit);
    const leadingRaw = layer.lineHeight && layer.fontSize ? layer.lineHeight / layer.fontSize : 1.2;
    const leading = Number.isFinite(leadingRaw) && leadingRaw > 0 ? leadingRaw : 1.2;
    const estimatedLines = layer.type === 'text' && sizePx > 0
      ? Math.max(1, Math.min(100, Math.round(h / Math.max(1, sizePx * leading))))
      : 1;
    const natural = layer.imageUrl ? imageNaturalSizeCache.get(layer.imageUrl) : undefined;
    return {
      id,
      kind: paint.kind,
      bounds: { x, y, w, h },
      visible: layer.visible,
      opacity: layer.opacity,
      version: stableLayerVersion(layer),
      text: layer.type === 'text' ? {
        content: layer.text ?? '',
        font_family: layer.fontFamily ?? '',
        size_px: sizePx,
        leading,
        tracking: layer.letterSpacing ?? 0,
        bold: Number(layer.fontWeight ?? '400') >= 600 || layer.fontWeight === 'bold',
        color: colorFromHex(layer.fill),
        lines: estimatedLines,
      } : undefined,
      fill: paint.fill ? colorFromHex(paint.fill) : undefined,
      shape: paint.shape,
      image: paint.kind === 'image' ? {
        source_w: natural?.w ?? 0,
        source_h: natural?.h ?? 0,
        displayed_w: w,
        displayed_h: h,
      } : undefined,
    };
  });

  return JSON.stringify({
    page: {
      width_px: toPx(design.width, design.unit),
      height_px: toPx(design.height, design.unit),
      background: colorFromHex(design.background),
      color_mode: 'rgb',
    },
    layers,
    mode: design.mode === 'corporate' ? (design.styleId ? 'corporate_full' : 'corporate_base') : 'creative',
    intent: 'screen',
  });
}

function formatMeasured(value: number, unit: RustFinding['measured']['unit']): string {
  if (unit === 'ratio') return `${value.toFixed(1)}:1`;
  if (unit === 'fraction') return `${Math.round(value * 100)}%`;
  if (unit === 'share') return `${Math.round(value * 100)}%`;
  if (unit === 'px' || unit === 'mm') return `${Math.round(value * 10) / 10}${unit}`;
  return `${Math.round(value)}`;
}

function formatExpected(expected: RustFinding['expected'], unit: RustFinding['measured']['unit']): string {
  const value = (number: number) => formatMeasured(number, unit);
  switch (expected.kind) {
    case 'at_least': return `≥ ${value(expected.value)}`;
    case 'at_most': return `≤ ${value(expected.value)}`;
    case 'exactly': return `Exactly ${value(expected.value)}`;
    case 'range': return `${value(expected.lo)} to ${value(expected.hi)}`;
  }
}

function categoryFor(rule: string): ReviewFinding['category'] {
  if (rule === 'contrast') return 'contrast';
  if (rule === 'text.hidden') return 'overlap';
  if (rule === 'text_size' || rule === 'leading' || rule.startsWith('hierarchy.') || rule.startsWith('text.')) return 'text-size';
  if (rule === 'alignment' || rule.startsWith('grid.')) return 'alignment';
  if (rule === 'overlap') return 'overlap';
  if (rule === 'spacing' || rule === 'tangency') return 'spacing';
  if (rule === 'distortion' || rule.startsWith('print.')) return 'crop';
  return 'style-consistency';
}

function toReviewFinding(view: FindingView, ids: Map<number, string>): ReviewFinding {
  const { finding } = view;
  const currentValue = formatMeasured(finding.measured.value, finding.measured.unit);
  const requiredValue = formatExpected(finding.expected, finding.measured.unit);
  return {
    id: view.key,
    rule: finding.rule,
    measured: currentValue,
    expected: requiredValue,
    category: categoryFor(finding.rule),
    title: view.message,
    currentValue,
    requiredValue,
    explanation: view.explanation,
    fixActionLabel: finding.fix?.safety === 'safe' ? 'Apply teacher fix' : 'Review manually',
    layerId: finding.layers.length > 0 ? ids.get(finding.layers[0]!) : undefined,
    isFixable: finding.fix?.safety === 'safe',
    confidence: finding.severity,
  };
}

function authorizedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const token = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, credentials: 'include' });
}

export interface RustTeacherState {
  findings: ReviewFinding[];
  unavailable: string[];
  styleMessage: string | null;
  loading: boolean;
  error: string | null;
  applyFix: (finding: ReviewFinding) => Promise<void>;
  applyAllFixes: () => Promise<void>;
  noteUndo: () => Promise<void>;
  gestureStart: () => void;
  gestureEnd: () => void;
}

function cacheKey(designId: string): string {
  return `teacher:findings:${designId}`;
}

function loadPersisted(designId: string): { findings: ReviewFinding[]; unavailable: string[] } | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(cacheKey(designId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { findings?: unknown; unavailable?: unknown };
    if (!Array.isArray(parsed.findings)) return null;
    return {
      findings: parsed.findings as ReviewFinding[],
      unavailable: Array.isArray(parsed.unavailable) ? (parsed.unavailable as string[]) : [],
    };
  } catch {
    return null;
  }
}

function persistFindings(designId: string, findings: ReviewFinding[], unavailable: string[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(cacheKey(designId), JSON.stringify({ findings, unavailable, at: Date.now() }));
  } catch {
    /* storage full or unavailable: teacher still works in-memory */
  }
}

export function useRustTeacher(
  design: Design | null,
  apiBaseUrl: string,
  learningConsent: boolean,
  onDesignChange: (updates: Partial<Design>) => void,
  onSelectLayers: (ids: string[]) => void,
  runEditorCommands: RunTeacherCommands,
): RustTeacherState {
  const designRef = useRef<Design | null>(design);
  const onDesignChangeRef = useRef(onDesignChange);
  const onSelectLayersRef = useRef(onSelectLayers);
  const runEditorCommandsRef = useRef(runEditorCommands);
  const bridgeRef = useRef<TeacherBridge | WorkerTeacherBridge | null>(null);
  const recorderRef = useRef<Pick<EventRecorder, 'stop' | 'setConsent'> | null>(null);
  const gestureActiveRef = useRef(false);
  const numericToLayerRef = useRef(new Map<number, string>());
  const layerToNumericRef = useRef(new Map<string, number>());
  const nextNumericIdRef = useRef(1);
  const layerSigRef = useRef(new Map<string, number>());
  const previousPageRef = useRef('');
  const [findings, setFindings] = useState<ReviewFinding[]>(() => {
    try {
      const raw = design?.id ? localStorage.getItem(`teacher:findings:${design.id}`) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as { findings?: ReviewFinding[] };
        if (Array.isArray(parsed.findings)) return parsed.findings;
      }
    } catch { /* ignore */ }
    return [];
  });
  const [unavailable, setUnavailable] = useState<string[]>(() => {
    try {
      const raw = design?.id ? localStorage.getItem(`teacher:findings:${design.id}`) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as { unavailable?: string[] };
        if (Array.isArray(parsed.unavailable)) return parsed.unavailable;
      }
    } catch { /* ignore */ }
    return [];
  });
  const [styleMessage, setStyleMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bridgeVersion, setBridgeVersion] = useState(0);
  const learningConsentRef = useRef(learningConsent);
  learningConsentRef.current = learningConsent;

  // Keep refs current without recreating the host/bridge.
  useEffect(() => {
    designRef.current = design;
    onDesignChangeRef.current = onDesignChange;
    onSelectLayersRef.current = onSelectLayers;
    runEditorCommandsRef.current = runEditorCommands;
  });

  useEffect(() => {
    if (!design || design.mode !== 'corporate') return;
    preloadImageSizes(design.layers, () => {
      if (designRef.current?.id === design.id) bridgeRef.current?.onChange([], true);
    });
    const present = new Set(design.layers.map((layer) => layer.id));
    for (const [id, numeric] of layerToNumericRef.current) {
      if (!present.has(id)) { layerToNumericRef.current.delete(id); numericToLayerRef.current.delete(numeric); }
    }
    for (const layer of design.layers) {
      if (layerToNumericRef.current.has(layer.id)) continue;
      const numeric = nextNumericIdRef.current++;
      layerToNumericRef.current.set(layer.id, numeric);
      numericToLayerRef.current.set(numeric, layer.id);
    }
  }, [design?.layers, design?.id, design?.mode]);

  const hostRef = useRef<TeacherHost | null>(null);
  if (!hostRef.current) {
    hostRef.current = {
      now: () => Date.now(),
      snapshotJson: () => {
        const current = designRef.current;
        return current ? snapshotFor(current, layerToNumericRef.current) : '';
      },
      runCommands: async (commands) => {
        const current = designRef.current;
        if (!current) throw new Error('No design is open.');
        const updates = await runEditorCommandsRef.current(commands, numericToLayerRef.current);
        const latest = designRef.current;
        if (latest?.id !== current.id) return;
        designRef.current = { ...latest, ...updates, updatedAt: Date.now() };
        onDesignChangeRef.current(updates);
        // Tell the engine exactly what changed so it can re-run immediately.
        const touched = new Set<number>();
        for (const c of commands) {
          if ('layer' in c) touched.add((c as { layer: number }).layer);
        }
        bridgeRef.current?.onChange([...touched], false);
      },
      selectLayers: (ids) => {
        onSelectLayersRef.current(ids.map((id) => numericToLayerRef.current.get(id)).filter((id): id is string => Boolean(id)));
      },
      renderPagePng: (maxPx) => {
        const current = designRef.current;
        if (!current) return Promise.reject(new Error('No design is open.'));
        return renderDesignToPng(current, maxPx);
      },
    };
  }
  const host = hostRef.current;
  const initedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ownedBridge: TeacherBridge | WorkerTeacherBridge | null = null;
    let ownedWasm: WasmTeacher | null = null;
    let unsubscribe: (() => void) | undefined;
    gestureActiveRef.current = false;
    const designId = design?.id ?? null;
    if (!designId || design?.mode !== 'corporate' || !design) {
      bridgeRef.current?.stop();
      recorderRef.current?.stop();
      bridgeRef.current = null;
      recorderRef.current = null;
      initedRef.current = null;
      setLoading(false);
      if (!designId) { setFindings([]); setUnavailable([]); setStyleMessage(null); }
      return () => { cancelled = true; };
    }
    layerToNumericRef.current = new Map();
    numericToLayerRef.current = new Map();
    nextNumericIdRef.current = 1;
    for (const layer of design.layers) {
      const numeric = nextNumericIdRef.current++;
      layerToNumericRef.current.set(layer.id, numeric);
      numericToLayerRef.current.set(numeric, layer.id);
    }
    layerSigRef.current = new Map(design.layers.map((l) => [l.id, stableLayerVersion(l)]));
    previousPageRef.current = JSON.stringify([design.width, design.height, design.unit, design.background]);
    const persisted = loadPersisted(designId);
    if (persisted) { setFindings(persisted.findings); setUnavailable(persisted.unavailable); }
    else { setFindings([]); setUnavailable([]); }
    setStyleMessage(null);
    setError(null);
    const apiRoot = apiBaseUrl.replace(/\/$/, '');
    const catalog = new CatalogSync(`${apiRoot}/v1`, authorizedFetch);
    let recorder: EventRecorder | null = null;

    const start = async () => {
      setLoading(true);
      let bridge: TeacherBridge | WorkerTeacherBridge;
      if (typeof Worker !== 'undefined') {
        bridge = new WorkerTeacherBridge(host, `${apiRoot}/v1`, learningConsentRef.current);
      } else {
        const { WasmTeacher: Teacher } = await loadTeacher();
        if (cancelled) return;
        const wasm = new Teacher('');
        ownedWasm = wasm;
        recorder = new EventRecorder(`${apiRoot}/v1`, authorizedFetch);
        bridge = new TeacherBridge(wasm, host, recorder, catalog);
      }
      ownedBridge = bridge;
      unsubscribe = bridge.subscribe((state) => {
        if (cancelled) return;
        const mapped = state.findings.map((view) => toReviewFinding(view, numericToLayerRef.current));
        setError(null);
        setFindings(mapped);
        setUnavailable(state.unavailable);
        persistFindings(designId, mapped, state.unavailable);
      });
      await recorder?.start(learningConsentRef.current);
      if (cancelled) return;
      await bridge.start();
      if (cancelled) return;
      bridgeRef.current = bridge;
      recorderRef.current = recorder ?? bridge as WorkerTeacherBridge;
      initedRef.current = designId;
      if (gestureActiveRef.current) bridge.gestureStart();
      bridge.setLevel(designRef.current?.styleId ? 'corporate_full' : 'corporate_base');
      const d = designRef.current;
      if (d) bridge.onChange(d.layers.map((l) => layerToNumericRef.current.get(l.id)!).filter(Boolean), true);
      if (!cancelled) setLoading(false);
      setBridgeVersion((version) => version + 1);
    };

    void start().catch((reason) => {
      if (cancelled) return;
      setLoading(false);
      setError(reason instanceof Error ? reason.message : 'The teacher could not be loaded.');
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
      ownedBridge?.stop();
      recorder?.stop();
      ownedWasm?.free();
      if (bridgeRef.current === ownedBridge) {
        bridgeRef.current = null;
        recorderRef.current = null;
        initedRef.current = null;
      }
    };
  }, [apiBaseUrl, design?.id, design?.mode]);

  useEffect(() => {
    void recorderRef.current?.setConsent(learningConsent).catch(() => {});
  }, [learningConsent, bridgeVersion]);

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge || design?.mode !== 'corporate') return;
    let cancelled = false;
    const styleId = design.styleId;
    const catalog = new CatalogSync(`${apiBaseUrl.replace(/\/$/, '')}/v1`, authorizedFetch);
    bridge.setLevel(styleId ? 'corporate_full' : 'corporate_base');
    // Clear the old profile immediately while a new profile is loading.
    void bridge.setStyle(null).catch(() => {});
    setStyleMessage(null);
    if (styleId) void (async () => {
      const { entries } = await catalog.index();
      if (cancelled) return;
      const entry = entries.find((candidate) => candidate.id === styleId);
      if (!entry) { setStyleMessage('This style is not in the catalog. Showing base checks.'); return; }
      const result = await bridge.setStyle({ id: entry.id, version: entry.version });
      if (cancelled || result.ok) return;
      setStyleMessage(result.reason === 'needs_update' ? 'This style needs an app update.' : 'Style not downloaded. Connect to load it.');
    })().catch(() => { if (!cancelled) setStyleMessage('Style not downloaded. Connect to load it.'); });
    return () => { cancelled = true; };
  }, [apiBaseUrl, design?.id, design?.mode, design?.styleId, bridgeVersion]);

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge || !design || design.mode !== 'corporate') return;
    if (initedRef.current !== design.id) return;
    const sigs = new Map<string, number>();
    for (const layer of design.layers) sigs.set(layer.id, stableLayerVersion(layer));
    const page = JSON.stringify([design.width, design.height, design.unit, design.background]);
    const prev = layerSigRef.current;
    const changed: number[] = [];
    for (const [id, v] of sigs) {
      if (prev.get(id) !== v) {
        const n = layerToNumericRef.current.get(id);
        if (n) changed.push(n);
      }
    }
    // Deletions, reordered layers and unit changes affect page-wide rules too.
    const previousIds = [...prev.keys()];
    const pageChanged = page !== previousPageRef.current || sigs.size !== prev.size || [...sigs.keys()].some((id, index) => id !== previousIds[index]);
    if (!pageChanged && changed.length === 0) return;
    layerSigRef.current = sigs;
    previousPageRef.current = page;
    bridge.onChange(changed, pageChanged || changed.length === 0);
  }, [design?.layers, design?.width, design?.height, design?.unit, design?.background, design?.id, design?.mode, bridgeVersion]);

  const applyFix = useCallback(async (finding: ReviewFinding) => {
    const bridge = bridgeRef.current;
    setError(null);
    try { await bridge?.apply(finding.id); }
    catch (reason) { if (bridge === bridgeRef.current) setError(reason instanceof Error ? reason.message : 'The fix could not be applied.'); }
  }, []);

  const applyAllFixes = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    setError(null);
    try {
      const plan = await bridge.planApplyAll();
      if (bridge === bridgeRef.current && plan.fixes.length > 0) await bridge.commitApplyAll(plan);
    } catch (reason) { if (bridge === bridgeRef.current) setError(reason instanceof Error ? reason.message : 'The fixes could not be applied.'); }
  }, []);

  const noteUndo = useCallback(async () => {
    const bridge = bridgeRef.current;
    try { await bridge?.onUndo(); }
    catch (reason) { if (bridge === bridgeRef.current) setError(reason instanceof Error ? reason.message : 'The undo signal could not be recorded.'); }
  }, []);

  const gestureStart = useCallback(() => {
    gestureActiveRef.current = true;
    bridgeRef.current?.gestureStart();
  }, []);

  const gestureEnd = useCallback(() => {
    gestureActiveRef.current = false;
    bridgeRef.current?.gestureEnd();
  }, []);

  return { findings, unavailable, styleMessage, loading, error, applyFix, applyAllFixes, noteUndo, gestureStart, gestureEnd };
}
