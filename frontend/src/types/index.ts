export type Unit = 'px' | 'mm' | 'in';
export type DesignMode = 'creative' | 'corporate';

export type LayerType = 'rect' | 'circle' | 'text' | 'image' | 'star' | 'triangle' | 'frame';

export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  borderRadius?: number;
  
  // Typography properties
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: 'left' | 'center' | 'right';
  letterSpacing?: number;
  lineHeight?: number;

  // Image properties
  imageUrl?: string;
  assetId?: string;
}

export interface Design {
  id: string;
  title: string;
  width: number;
  height: number;
  unit: Unit;
  mode: DesignMode;
  styleId?: string;
  createdAt: number;
  updatedAt: number;
  isSaved: boolean;
  isDeleted?: boolean;
  deletedAt?: number;
  layers: Layer[];
  background: string;
  thumbnailUrl?: string;
  /** Remote identity and sync state are optional so offline-only designs remain valid. */
  remoteId?: string;
  remoteVersion?: number;
  syncStatus?: 'local' | 'syncing' | 'synced' | 'error';
}

export interface PresetSize {
  id: string;
  name: string;
  width: number;
  height: number;
  unit: Unit;
  description: string;
  category: 'social' | 'print' | 'presentation' | 'custom';
}

export interface StyleProfile {
  id: string;
  name: string;
  description: string;
  accent: string;
  palette: string[];
  primaryFont: string;
  headingFont: string;
  previewThumbnail?: string;
  rules: {
    minContrast: number;
    minBodyFontSize: number;
    maxColors: number;
    preferredAlignments: ('left' | 'center' | 'right')[];
    gridSpacing: number;
    defaultMargin: number;
  };
}

export interface ReviewFinding {
  id: string;
  category: 'contrast' | 'text-size' | 'alignment' | 'spacing' | 'crop' | 'style-consistency';
  title: string;
  currentValue: string;
  requiredValue: string;
  explanation: string;
  fixActionLabel: string;
  layerId?: string;
  isFixable: boolean;
  confidence: 'must' | 'optional';
  fixed?: boolean;
}

export interface AppSettings {
  profileName: string;
  profileAvatar: string;
  defaultMode: DesignMode;
  defaultStyle: string;
  autosaveInterval: number; // in seconds
  defaultUnit: Unit;
  aiReviewConsent: boolean;
  learningDataConsent: boolean;
}

export type NavigationDestination = 
  | 'home' 
  | 'designs' 
  | 'templates' 
  | 'trash' 
  | 'tutorials' 
  | 'styles' 
  | 'settings' 
  | 'privacy' 
  | 'help' 
  | 'legal'
  | 'editor';

