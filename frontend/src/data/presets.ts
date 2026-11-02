import { PresetSize } from '../types';

export const PRESET_SIZES: PresetSize[] = [
  {
    id: 'preset-instagram',
    name: 'Instagram post',
    width: 1080,
    height: 1080,
    unit: 'px',
    description: '1080 × 1080 px • 1:1 Square',
    category: 'social',
  },
  {
    id: 'preset-a4',
    name: 'A4 document',
    width: 1240,
    height: 1754,
    unit: 'px',
    description: '1240 × 1754 px • Standard Print',
    category: 'print',
  },
  {
    id: 'preset-business-card',
    name: 'Business card',
    width: 1050,
    height: 600,
    unit: 'px',
    description: '1050 × 600 px • 3.5 × 2 in landscape',
    category: 'print',
  },
  {
    id: 'preset-slide',
    name: 'Presentation slide',
    width: 1920,
    height: 1080,
    unit: 'px',
    description: '1920 × 1080 px • 16:9 Widescreen',
    category: 'presentation',
  },
  {
    id: 'preset-custom',
    name: 'Custom',
    width: 800,
    height: 800,
    unit: 'px',
    description: 'Define your own canvas dimensions',
    category: 'custom',
  },
];

