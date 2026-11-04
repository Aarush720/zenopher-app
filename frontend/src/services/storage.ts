import { Design, AppSettings } from '../types';

const DB_NAME = 'zenopher_db';
const DB_VERSION = 1;
const DESIGNS_STORE = 'designs';
const SETTINGS_STORE = 'settings';
const STARTER_SEEDED_KEY = 'starter_designs_seeded';
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CANVAS_DIMENSION = 10000;
const MAX_LAYERS = 1000;

export const DEFAULT_SETTINGS: AppSettings = {
  profileName: 'Aarush Singh',
  profileAvatar: '',
  defaultMode: 'creative',
  defaultStyle: '',
  autosaveInterval: 15,
  defaultUnit: 'px',
  aiReviewConsent: true,
  learningDataConsent: false,
};

// Starter initial designs to demonstrate the floating monochrome workflow
const INITIAL_DESIGNS: Design[] = [
  {
    id: 'design-zen-brand',
    title: 'Brand Monograph',
    width: 1080,
    height: 1080,
    unit: 'px',
    mode: 'corporate',
    styleId: 'bauhaus',
    createdAt: Date.now() - 3600 * 1000 * 2,
    updatedAt: Date.now() - 3600 * 1000 * 2,
    isSaved: true,
    isDeleted: false,
    background: '#111111',
    layers: [
      {
        id: 'layer-bg-card',
        name: 'Inner Container',
        type: 'rect',
        x: 100,
        y: 100,
        width: 880,
        height: 880,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#2C2C2C',
        borderRadius: 8,
      },
      {
        id: 'layer-headline',
        name: 'Monograph Title',
        type: 'text',
        x: 160,
        y: 220,
        width: 760,
        height: 120,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#FFFFFF',
        text: 'PRECISION',
        fontSize: 72,
        fontFamily: 'Lufga',
        fontWeight: '800',
        textAlign: 'left',
        letterSpacing: -2,
        lineHeight: 1.1,
      },
      {
        id: 'layer-subtitle',
        name: 'Monograph Subtitle',
        type: 'text',
        x: 164,
        y: 330,
        width: 600,
        height: 48,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 0.7,
        fill: '#FFFFFF',
        text: 'A desktop-first creative architecture for monochrome workflows.',
        fontSize: 20,
        fontFamily: 'Lufga',
        fontWeight: '400',
        textAlign: 'left',
        letterSpacing: 0,
        lineHeight: 1.4,
      },
      {
        id: 'layer-geo-circle',
        name: 'Geometric Core',
        type: 'circle',
        x: 164,
        y: 440,
        width: 240,
        height: 240,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#111111',
        stroke: '#FFFFFF',
        strokeWidth: 4,
      },
      {
        id: 'layer-geo-card',
        name: 'Accent Plate',
        type: 'rect',
        x: 440,
        y: 440,
        width: 480,
        height: 240,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#000000',
        borderRadius: 6,
      },
      {
        id: 'layer-plate-text',
        name: 'Plate Monospace Tag',
        type: 'text',
        x: 480,
        y: 540,
        width: 400,
        height: 40,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#FFFFFF',
        text: 'ZENOPHER // SYSTEM V1',
        fontSize: 18,
        fontFamily: 'JetBrains Mono',
        fontWeight: '600',
        textAlign: 'left',
        letterSpacing: 1,
      },
    ],
  },
  {
    id: 'design-slide-deck',
    title: 'Executive Pitch Deck',
    width: 1920,
    height: 1080,
    unit: 'px',
    mode: 'corporate',
    styleId: 'swiss-modern',
    createdAt: Date.now() - 3600 * 1000 * 24,
    updatedAt: Date.now() - 3600 * 1000 * 12,
    isSaved: true,
    isDeleted: false,
    background: '#000000',
    layers: [
      {
        id: 'layer-slide-title',
        name: 'Deck Header',
        type: 'text',
        x: 140,
        y: 180,
        width: 1200,
        height: 140,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#FFFFFF',
        text: 'Geometric Coherence in Modern Interfaces',
        fontSize: 64,
        fontFamily: 'Lufga',
        fontWeight: '700',
        textAlign: 'left',
        letterSpacing: -1,
      },
      {
        id: 'layer-card-1',
        name: 'Column 1',
        type: 'rect',
        x: 140,
        y: 380,
        width: 480,
        height: 480,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#111111',
        borderRadius: 8,
      },
      {
        id: 'layer-card-2',
        name: 'Column 2',
        type: 'rect',
        x: 660,
        y: 380,
        width: 480,
        height: 480,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#111111',
        borderRadius: 8,
      },
      {
        id: 'layer-card-3',
        name: 'Column 3',
        type: 'rect',
        x: 1180,
        y: 380,
        width: 480,
        height: 480,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#2C2C2C',
        borderRadius: 8,
      },
    ],
  },
  {
    id: 'design-creative-sketch',
    title: 'Typographic Specimen',
    width: 1080,
    height: 1080,
    unit: 'px',
    mode: 'creative',
    createdAt: Date.now() - 3600 * 1000 * 48,
    updatedAt: Date.now() - 3600 * 1000 * 20,
    isSaved: true,
    isDeleted: false,
    background: '#111111',
    layers: [
      {
        id: 'layer-type-hero',
        name: 'Specimen Huge',
        type: 'text',
        x: 120,
        y: 320,
        width: 840,
        height: 240,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        fill: '#FFFFFF',
        text: 'Lufga',
        fontSize: 160,
        fontFamily: 'Lufga',
        fontWeight: '800',
        textAlign: 'left',
        letterSpacing: -4,
      },
      {
        id: 'layer-type-desc',
        name: 'Specimen Copy',
        type: 'text',
        x: 124,
        y: 600,
        width: 780,
        height: 120,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 0.68,
        fill: '#FFFFFF',
        text: 'Blends geometric precision with subtle humanist details. Clean, highly legible, and quietly confident.',
        fontSize: 24,
        fontFamily: 'Lufga',
        fontWeight: '400',
        textAlign: 'left',
        letterSpacing: 0,
        lineHeight: 1.5,
      },
    ],
  },
];

class StorageService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async getInternalSetting<T>(key: string): Promise<T | null> {
    try {
      const db = await this.openDB();
      return await new Promise<T | null>((resolve) => {
        const tx = db.transaction(SETTINGS_STORE, 'readonly');
        const request = tx.objectStore(SETTINGS_STORE).get(key);
        request.onsuccess = () => resolve((request.result?.value as T | undefined) ?? null);
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  private async setInternalSetting<T>(key: string, value: T): Promise<void> {
    const db = await this.openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE, 'readwrite');
      tx.objectStore(SETTINGS_STORE).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  private openDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(DESIGNS_STORE)) {
          const store = db.createObjectStore(DESIGNS_STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
          store.createIndex('isDeleted', 'isDeleted', { unique: false });
        }
        if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
          db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        console.error('IndexedDB open error:', request.error);
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  async getAllDesigns(): Promise<Design[]> {
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(DESIGNS_STORE, 'readonly');
        const store = tx.objectStore(DESIGNS_STORE);
        const request = store.getAll();

        request.onsuccess = async () => {
          let designs = (request.result as Design[] | undefined) ?? [];

          // Enforce the advertised 30-day retention policy on every load.
          const expired = designs.filter(
            (design) => design.isDeleted && design.deletedAt && Date.now() - design.deletedAt >= TRASH_RETENTION_MS,
          );
          await Promise.all(expired.map((design) => this.deletePermanently(design.id)));
          designs = designs.filter((design) => !expired.some((item) => item.id === design.id));

          if (designs.length === 0 && !(await this.getInternalSetting<boolean>(STARTER_SEEDED_KEY))) {
            await this.seedInitialDesigns();
            await this.setInternalSetting(STARTER_SEEDED_KEY, true);
            resolve(INITIAL_DESIGNS);
          } else {
            if (designs.length > 0 && !(await this.getInternalSetting<boolean>(STARTER_SEEDED_KEY))) {
              await this.setInternalSetting(STARTER_SEEDED_KEY, true);
            }
            resolve(designs);
          }
        };

        request.onerror = () => {
          resolve(INITIAL_DESIGNS);
        };
      });
    } catch {
      return INITIAL_DESIGNS;
    }
  }

  async seedInitialDesigns(): Promise<void> {
    try {
      const db = await this.openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(DESIGNS_STORE, 'readwrite');
        const store = tx.objectStore(DESIGNS_STORE);
        for (const d of INITIAL_DESIGNS) store.put(d);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('Seeding failed:', e);
    }
  }

  async getDesign(id: string): Promise<Design | null> {
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(DESIGNS_STORE, 'readonly');
        const store = tx.objectStore(DESIGNS_STORE);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  async saveDesign(design: Design): Promise<void> {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DESIGNS_STORE, 'readwrite');
        const store = tx.objectStore(DESIGNS_STORE);
        store.put(design);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (e) {
      console.error('Failed to save design to IndexedDB:', e);
    }
  }

  async moveToTrash(id: string): Promise<void> {
    const design = await this.getDesign(id);
    if (design) {
      design.isDeleted = true;
      design.deletedAt = Date.now();
      await this.saveDesign(design);
    }
  }

  async restoreFromTrash(id: string): Promise<void> {
    const design = await this.getDesign(id);
    if (design) {
      design.isDeleted = false;
      design.deletedAt = undefined;
      await this.saveDesign(design);
    }
  }

  async deletePermanently(id: string): Promise<void> {
    try {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DESIGNS_STORE, 'readwrite');
        const store = tx.objectStore(DESIGNS_STORE);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.error('Failed to permanently delete:', e);
    }
  }

  async emptyTrash(): Promise<void> {
    const designs = await this.getAllDesigns();
    const trashItems = designs.filter((d) => d.isDeleted);
    for (const item of trashItems) {
      await this.deletePermanently(item.id);
    }
  }

  async clearAllData(): Promise<void> {
    const currentDb = await this.openDB().catch(() => null);
    currentDb?.close();
    this.dbPromise = null;

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onblocked = () => currentDb?.close();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Keep the post-wipe state empty instead of re-seeding demo designs on reload.
    await this.setInternalSetting(STARTER_SEEDED_KEY, true);
  }

  async getSettings(): Promise<AppSettings> {
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(SETTINGS_STORE, 'readonly');
        const store = tx.objectStore(SETTINGS_STORE);
        const req = store.get('app_settings');
        req.onsuccess = () => {
          if (req.result && req.result.value) {
            resolve({ ...DEFAULT_SETTINGS, ...req.result.value });
          } else {
            resolve(DEFAULT_SETTINGS);
          }
        };
        req.onerror = () => resolve(DEFAULT_SETTINGS);
      });
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction(SETTINGS_STORE, 'readwrite');
        const store = tx.objectStore(SETTINGS_STORE);
        store.put({ key: 'app_settings', value: updated });
        tx.oncomplete = () => resolve(updated);
        tx.onerror = () => resolve(updated);
      });
    } catch {
      return updated;
    }
  }

  // File export (.zph format)
  exportZPH(design: Design): void {
    const data = {
      app: 'Zenopher',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      design,
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${design.title.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'design'}.zph`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Parse imported .zph JSON file
  async importZPH(file: File): Promise<Design> {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('The selected file is not valid JSON');
    }

    if (!isRecord(parsed) || !isRecord(parsed.design)) {
      throw new Error('Invalid Zenopher project file (.zph)');
    }

    const design = normalizeImportedDesign(parsed.design);
    const importedDesign: Design = {
      ...design,
      id: 'design-' + Math.random().toString(36).substring(2, 9),
      title: `${design.title} (Imported)`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false,
    };
    await this.saveDesign(importedDesign);
    return importedDesign;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isLayerType(value: unknown): value is Design['layers'][number]['type'] {
  return ['rect', 'circle', 'text', 'image', 'star', 'triangle', 'frame'].includes(value as string);
}

function normalizeImportedDesign(value: Record<string, unknown>): Design {
  const layers = value.layers;
  const width = value.width;
  const height = value.height;

  if (
    !Array.isArray(layers) ||
    layers.length > MAX_LAYERS ||
    typeof value.title !== 'string' ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_CANVAS_DIMENSION ||
    height > MAX_CANVAS_DIMENSION ||
    !['px', 'mm', 'in'].includes(value.unit as string) ||
    !['creative', 'corporate'].includes(value.mode as string) ||
    typeof value.background !== 'string'
  ) {
    throw new Error('Invalid Zenopher project structure');
  }

  const normalizedLayers = layers.map((rawLayer, index) => {
    if (!isRecord(rawLayer) || !isLayerType(rawLayer.type)) {
      throw new Error(`Invalid layer at index ${index}`);
    }

    const numericFields = ['x', 'y', 'width', 'height', 'rotation', 'opacity'];
    if (numericFields.some((field) => !isFiniteNumber(rawLayer[field]))) {
      throw new Error(`Invalid numeric value in layer ${index}`);
    }
    const layerWidth = rawLayer.width as number;
    const layerHeight = rawLayer.height as number;
    const layerOpacity = rawLayer.opacity as number;
    if (layerWidth <= 0 || layerHeight <= 0 || layerOpacity < 0 || layerOpacity > 1) {
      throw new Error(`Invalid dimensions or opacity in layer ${index}`);
    }

    return {
      ...rawLayer,
      id: typeof rawLayer.id === 'string' && rawLayer.id ? rawLayer.id : `layer-imported-${index}`,
      name: typeof rawLayer.name === 'string' && rawLayer.name ? rawLayer.name : `Layer ${index + 1}`,
      text: typeof rawLayer.text === 'string' ? rawLayer.text.slice(0, 100000) : rawLayer.text,
    } as Design['layers'][number];
  });

  return {
    id: typeof value.id === 'string' ? value.id : 'imported',
    title: value.title.slice(0, 200),
    width,
    height,
    unit: value.unit as Design['unit'],
    mode: value.mode as Design['mode'],
    styleId: typeof value.styleId === 'string' ? value.styleId : undefined,
    createdAt: isFiniteNumber(value.createdAt) ? value.createdAt : Date.now(),
    updatedAt: isFiniteNumber(value.updatedAt) ? value.updatedAt : Date.now(),
    isSaved: true,
    isDeleted: false,
    layers: normalizedLayers,
    background: value.background,
    thumbnailUrl: typeof value.thumbnailUrl === 'string' ? value.thumbnailUrl : undefined,
  };
}

export const storage = new StorageService();

