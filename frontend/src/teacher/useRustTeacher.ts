import { useCallback, useEffect, useRef, useState } from 'react';
import type { Design, Layer, ReviewFinding } from '../types';
import { renderDesignToPng } from '../services/render';
import initTeacherWasm, { WasmTeacher } from './generated/zenopher_teacher';
import { TeacherBridge } from '../../../zenopher-teacher/web/src/teacher/bridge';
import { CatalogSync } from '../../../zenopher-teacher/web/src/teacher/catalogSync';
import { EventRecorder } from '../../../zenopher-teacher/web/src/teacher/eventRecorder';
import type { Command, FindingView, TeacherHost } from '../../../zenopher-teacher/web/src/teacher/types';

const ACCESS_TOKEN_KEY = 'zenopher_access_token';

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

function colorToHex(color: RustColor): string {
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value * 255))).toString(16).padStart(2, '0');
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`.toUpperCase();
}

function stableLayerVersion(layer: Layer): number {
  const source = JSON.stringify({
    id: layer.id,
    type: layer.type,
    x: Math.round(layer.x * 100) / 100,
    y: Math.round(layer.y * 100) / 100,
    width: Math.round(layer.width * 100) / 100,
    height: Math.round(layer.height * 100) / 100,
    rotation: layer.rotation ?? 0,
    visible: layer.visible,
    opacity: layer.opacity,
    fill: layer.fill,
    stroke: layer.stroke,
    strokeWidth: layer.strokeWidth,
    borderRadius: layer.borderRadius,
    text: layer.text,
    fontSize: layer.fontSize,
    fontFamily: layer.fontFamily,
    fontWeight: layer.fontWeight,
    lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing,
    textAlign: layer.textAlign,
    imageUrl: layer.imageUrl,
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function layerKind(layer: Layer): 'text' | 'shape' | 'image' | 'group' {
  if (layer.type === 'text') return 'text';
  if (layer.type === 'image') return 'image';
  return 'shape';
}

function shapeKind(layer: Layer): 'rect' | 'ellipse' | 'line' | 'polygon' | 'path' | undefined {
  if (layer.type === 'circle') return 'ellipse';
  if (layer.type === 'triangle' || layer.type === 'star') return 'polygon';
  if (layer.type === 'frame' || layer.type === 'rect') return 'rect';
  return undefined;
}

function toPx(value: number, unit: Design['unit']): number {
  if (!Number.isFinite(value)) return 0;
  if (unit === 'mm') return value * (96 / 25.4);
  if (unit === 'in') return value * 96;
  return value;
}

const imageNaturalSizeCache = new Map<string, { w: number; h: number }>();

function preloadImageSizes(layers: Layer[]): void {
  if (typeof Image === 'undefined') return;
  for (const layer of layers) {
    if (layer.type !== 'image' || !layer.imageUrl) continue;
    if (imageNaturalSizeCache.has(layer.imageUrl)) continue;
    const url = layer.imageUrl;
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 0;
      const h = img.naturalHeight || 0;
      if (w > 0 && h > 0) imageNaturalSizeCache.set(url, { w, h });
    };
    img.onerror = () => undefined;
    img.src = url;
  }
}

function snapshotFor(design: Design, ids: Map<string, number>): string {
  const layers = design.layers.map((layer) => {
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
      kind: layerKind(layer),
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
      fill: layer.type === 'text' ? undefined : colorFromHex(layer.fill),
      shape: shapeKind(layer),
      image: layer.type === 'image' ? {
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

function applyCommands(design: Design, commands: Command[], ids: Map<number, string>): Layer[] {
  const layers = design.layers.map((layer) => ({ ...layer }));
  for (const command of commands) {
    const layerId = ids.get(command.layer);
    if (!layerId) continue;
    const layer = layers.find((candidate) => candidate.id === layerId);
    if (!layer) continue;

    switch (command.type) {
      case 'set_text_color':
        layer.fill = colorToHex(command.color);
        break;
      case 'set_font_size':
        layer.fontSize = command.size_px;
        break;
      case 'set_leading':
        layer.lineHeight = command.leading * (layer.fontSize ?? 16);
        break;
      case 'set_bounds':
        layer.x = command.rect.x;
        layer.y = command.rect.y;
        layer.width = command.rect.w;
        layer.height = command.rect.h;
        break;
      case 'move_by':
        layer.x += command.dx;
        layer.y += command.dy;
        break;
    }
  }
  return layers;
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
  if (rule === 'text_size' || rule === 'leading' || rule.startsWith('hierarchy.') || rule.startsWith('text.')) return 'text-size';
  if (rule === 'alignment' || rule.startsWith('grid.')) return 'alignment';
  if (rule === 'spacing' || rule === 'tangency' || rule === 'overlap') return 'spacing';
  if (rule === 'distortion' || rule.startsWith('print.')) return 'crop';
  return 'style-consistency';
}

function toReviewFinding(view: FindingView, ids: Map<number, string>): ReviewFinding {
  const { finding } = view;
  return {
    id: view.key,
    category: categoryFor(finding.rule),
    title: view.message,
    currentValue: formatMeasured(finding.measured.value, finding.measured.unit),
    requiredValue: formatExpected(finding.expected, finding.measured.unit),
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
): RustTeacherState {
  const designRef = useRef<Design | null>(design);
  const onDesignChangeRef = useRef(onDesignChange);
  const onSelectLayersRef = useRef(onSelectLayers);
  const bridgeRef = useRef<TeacherBridge | null>(null);
  const recorderRef = useRef<EventRecorder | null>(null);
  const numericToLayerRef = useRef(new Map<number, string>());
  const layerToNumericRef = useRef(new Map<string, number>());
  const nextNumericIdRef = useRef(1);
  const layerSigRef = useRef(new Map<string, number>());
  const prevSigRef = useRef('');
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

  // Keep refs current without recreating the host/bridge.
  useEffect(() => {
    designRef.current = design;
    onDesignChangeRef.current = onDesignChange;
    onSelectLayersRef.current = onSelectLayers;
    if (!design) return;
    preloadImageSizes(design.layers);
    for (const layer of design.layers) {
      if (layerToNumericRef.current.has(layer.id)) continue;
      const numeric = nextNumericIdRef.current++;
      layerToNumericRef.current.set(layer.id, numeric);
      numericToLayerRef.current.set(numeric, layer.id);
    }
  });

  const hostRef = useRef<TeacherHost | null>(null);
  if (!hostRef.current) {
    hostRef.current = {
      now: () => Date.now(),
      snapshotJson: () => {
        const current = designRef.current;
        return current ? snapshotFor(current, layerToNumericRef.current) : '';
      },
      runCommands: (commands) => {
        const current = designRef.current;
        if (!current) return;
        const layers = applyCommands(current, commands, numericToLayerRef.current);
        // Apply synchronously to the ref so the next pump sees fixed values.
        designRef.current = { ...current, layers, updatedAt: Date.now() };
        onDesignChangeRef.current({ layers });
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
  const wasmRef = useRef<WasmTeacher | null>(null);
  const initedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const designId = design?.id ?? null;
    const styleId = design?.styleId ?? null;
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
    if (initedRef.current === designId && bridgeRef.current) {
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
    prevSigRef.current = JSON.stringify({
      layers: [...layerSigRef.current.entries()].sort(),
      w: design.width, h: design.height, bg: design.background,
    });
    const persisted = loadPersisted(designId);
    if (persisted) { setFindings(persisted.findings); setUnavailable(persisted.unavailable); }
    else { setFindings([]); setUnavailable([]); }
    setStyleMessage(null);
    setError(null);
    const apiRoot = apiBaseUrl.replace(/\/$/, '');
    const catalog = new CatalogSync(`${apiRoot}/v1`, authorizedFetch);
    const recorder = new EventRecorder(`${apiRoot}/v1`, authorizedFetch);

    const start = async () => {
      setLoading(true);
      await initTeacherWasm();
      if (cancelled) return;
      const wasm = new WasmTeacher('');
      wasmRef.current = wasm;
      const bridge = new TeacherBridge(wasm, host, recorder, catalog);
      bridge.subscribe((state) => {
        if (cancelled) return;
        const mapped = state.findings.map((view) => toReviewFinding(view, numericToLayerRef.current));
        setFindings(mapped);
        setUnavailable(state.unavailable);
        persistFindings(designId, mapped, state.unavailable);
      });
      await recorder.start(learningConsent);
      await bridge.start();
      if (cancelled) { bridge.stop(); return; }
      bridgeRef.current = bridge;
      recorderRef.current = recorder;
      initedRef.current = designId;
      bridge.setLevel(styleId ? 'corporate_full' : 'corporate_base');
      if (styleId) {
        try {
          const { entries } = await catalog.index();
          if (cancelled) return;
          const entry = entries.find((c) => c.id === styleId);
          if (!entry) {
            bridge.setStyle(null);
            if (!cancelled) setStyleMessage('This style is not in the catalog. Showing base checks.');
          } else {
            const res = await bridge.setStyle({ id: entry.id, version: entry.version });
            if (cancelled) return;
            if (res.ok) setStyleMessage(null);
            else if (res.reason === 'not_downloaded') setStyleMessage('Style not downloaded. Connect to load it.');
            else if (res.reason === 'not_found') setStyleMessage('This style version cannot be loaded. Choose another style.');
            else setStyleMessage('This style needs an app update.');
          }
        } catch {
          if (!cancelled) { bridge.setStyle(null); setStyleMessage('Style not downloaded. Connect to load it.'); }
        }
      } else {
        bridge.setStyle(null);
      }
      const d = designRef.current;
      if (d) bridge.onChange(d.layers.map((l) => layerToNumericRef.current.get(l.id)!).filter(Boolean), true);
      if (!cancelled) setLoading(false);
    };

    void start().catch((reason) => {
      if (cancelled) return;
      setLoading(false);
      setError(reason instanceof Error ? reason.message : 'The teacher could not be loaded.');
    });

    return () => { cancelled = true; };
  }, [apiBaseUrl, design?.id, design?.mode, design?.styleId, learningConsent]);

  useEffect(() => () => {
    bridgeRef.current?.stop();
    recorderRef.current?.stop();
  }, []);

  useEffect(() => {
    const bridge = bridgeRef.current;
    if (!bridge || !design || design.mode !== 'corporate') return;
    if (initedRef.current !== design.id) return;
    const sigs = new Map<string, number>();
    for (const layer of design.layers) sigs.set(layer.id, stableLayerVersion(layer));
    const sig = JSON.stringify({
      layers: [...sigs.entries()].sort(),
      w: design.width, h: design.height, bg: design.background,
    });
    if (sig === prevSigRef.current) return;
    const prev = layerSigRef.current;
    const changed: number[] = [];
    for (const [id, v] of sigs) {
      if (prev.get(id) !== v) {
        const n = layerToNumericRef.current.get(id);
        if (n) changed.push(n);
      }
    }
    const pageChanged = sigs.size !== prev.size;
    layerSigRef.current = sigs;
    prevSigRef.current = sig;
    bridge.onChange(changed, pageChanged || changed.length === 0);
  });

  const applyFix = useCallback(async (finding: ReviewFinding) => {
    await bridgeRef.current?.apply(finding.id);
  }, []);

  const applyAllFixes = useCallback(async () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    const plan = bridge.planApplyAll();
    if (plan.fixes.length > 0) await bridge.commitApplyAll(plan);
  }, []);

  const noteUndo = useCallback(async () => {
    await bridgeRef.current?.onUndo();
  }, []);

  const gestureStart = useCallback(() => {
    bridgeRef.current?.gestureStart();
  }, []);

  const gestureEnd = useCallback(() => {
    bridgeRef.current?.gestureEnd();
  }, []);

  return { findings, unavailable, styleMessage, loading, error, applyFix, applyAllFixes, noteUndo, gestureStart, gestureEnd };
}
