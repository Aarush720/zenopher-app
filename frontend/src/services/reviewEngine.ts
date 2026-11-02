import { Design, Layer, ReviewFinding, StyleProfile } from '../types';
import { STYLE_PROFILES } from '../data/styles';

// Helper: calculate relative luminance of hex color
function getLuminance(hex: string): number | null {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (!/^[0-9a-f]{6}$/i.test(c)) return null;
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;

  const a = [r, g, b].map(v => {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

// Calculate contrast ratio between two hex colors
function getContrastRatio(hex1: string, hex2: string): number | null {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  if (lum1 === null || lum2 === null) return null;
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

export function runDesignReview(design: Design): ReviewFinding[] {
  // If in creative mode, strictly return empty findings (Creative mode has no review/findings)
  if (design.mode === 'creative') {
    return [];
  }

  const findings: ReviewFinding[] = [];
  const style = design.styleId ? STYLE_PROFILES.find(s => s.id === design.styleId) : null;
  const minContrast = style?.rules.minContrast || 4.5;
  const minBodyFontSize = style?.rules.minBodyFontSize || 13;
  const marginThreshold = style?.rules.defaultMargin || 24;

  for (const layer of design.layers) {
    if (!layer.visible) continue;

    // 1. Contrast Check for Text Layers
    if (layer.type === 'text' && layer.fill) {
      const bg = design.background || '#000000';
      const ratio = getContrastRatio(layer.fill, bg);
      if (ratio !== null && ratio < minContrast) {
        findings.push({
          id: `contrast-${layer.id}`,
          category: 'contrast',
          title: `Low text contrast on "${layer.name}"`,
          currentValue: `${ratio.toFixed(1)}:1`,
          requiredValue: `≥ ${minContrast.toFixed(1)}:1 (WCAG AA)`,
          explanation: `The text fill color lacks sufficient contrast against the artboard background (${bg}), making reading difficult.`,
          fixActionLabel: 'Adjust to Pure White (#FFFFFF)',
          layerId: layer.id,
          isFixable: true,
          confidence: 'must',
        });
      }
    }

    // 2. Text Size Check
    if (layer.type === 'text' && layer.fontSize) {
      if (layer.fontSize < minBodyFontSize) {
        findings.push({
          id: `text-size-${layer.id}`,
          category: 'text-size',
          title: `Undersized typography in "${layer.name}"`,
          currentValue: `${layer.fontSize}px`,
          requiredValue: `≥ ${minBodyFontSize}px`,
          explanation: `Text sized below ${minBodyFontSize}px does not meet desktop readability benchmarks for production assets.`,
          fixActionLabel: `Increase font size to ${minBodyFontSize}px`,
          layerId: layer.id,
          isFixable: true,
          confidence: 'must',
        });
      }
    }

    // 3. Spacing / Margin Check
    const isTooCloseLeft = layer.x < marginThreshold;
    const isTooCloseTop = layer.y < marginThreshold;
    if (isTooCloseLeft || isTooCloseTop) {
      const curMargin = Math.min(layer.x, layer.y);
      findings.push({
        id: `spacing-${layer.id}`,
        category: 'spacing',
        title: `Margin compression on "${layer.name}"`,
        currentValue: `${curMargin}px`,
        requiredValue: `≥ ${marginThreshold}px`,
        explanation: `Elements positioned right against artboard boundaries produce visual tension without designated padding.`,
        fixActionLabel: `Shift inward to ${marginThreshold}px margin`,
        layerId: layer.id,
        isFixable: true,
        confidence: 'optional',
      });
    }

    // 4. Crop Check (Overhang / Bleed outside Canvas)
    const overflowsLeft = layer.x < 0;
    const overflowsTop = layer.y < 0;
    const overflowsRight = layer.x + layer.width > design.width;
    const overflowsBottom = layer.y + layer.height > design.height;
    if (overflowsLeft || overflowsTop || overflowsRight || overflowsBottom) {
      const horizontalOverhang = Math.max(0, -layer.x, layer.x + layer.width - design.width);
      const verticalOverhang = Math.max(0, -layer.y, layer.y + layer.height - design.height);
      findings.push({
        id: `crop-${layer.id}`,
        category: 'crop',
        title: `Artboard overflow on "${layer.name}"`,
        currentValue: `${Math.round(Math.max(horizontalOverhang, verticalOverhang))}px overhang`,
        requiredValue: 'Within 100% canvas bounds',
        explanation: `Element extends past the canvas edge and will be clipped unexpectedly during image export.`,
        fixActionLabel: 'Fit bounds to canvas',
        layerId: layer.id,
        isFixable: true,
        confidence: 'must',
      });
    }

    // 5. Alignment Check
    // If element is off by 1 to 4 pixels from a 10px / 8px grid
    const snapGrid = style?.rules.gridSpacing || 8;
    const xRemainder = Math.abs(layer.x % snapGrid);
    const yRemainder = Math.abs(layer.y % snapGrid);
    if ((xRemainder > 1 && xRemainder < snapGrid - 1) || (yRemainder > 1 && yRemainder < snapGrid - 1)) {
      findings.push({
        id: `align-${layer.id}`,
        category: 'alignment',
        title: `Sub-grid alignment jitter on "${layer.name}"`,
        currentValue: `Offset: ${layer.x}px, ${layer.y}px`,
        requiredValue: `Grid multiple of ${snapGrid}px`,
        explanation: `Element is resting between grid increments, disrupting rhythmic column alignment.`,
        fixActionLabel: `Snap to ${snapGrid}px grid`,
        layerId: layer.id,
        isFixable: true,
        confidence: 'optional',
      });
    }

    // 6. Style Consistency Checks (if a style profile is selected)
    if (style) {
      if (layer.type === 'text' && layer.fontFamily && layer.fontFamily !== style.primaryFont && layer.fontFamily !== style.headingFont) {
        findings.push({
          id: `style-font-${layer.id}`,
          category: 'style-consistency',
          title: `Font deviation from ${style.name}`,
          currentValue: layer.fontFamily,
          requiredValue: style.primaryFont,
          explanation: `The ${style.name} design profile specifies ${style.primaryFont} for uniform typographic tone.`,
          fixActionLabel: `Set font to ${style.primaryFont}`,
          layerId: layer.id,
          isFixable: true,
          confidence: 'must',
        });
      }

      if (layer.type === 'text' && layer.textAlign && !style.rules.preferredAlignments.includes(layer.textAlign)) {
        findings.push({
          id: `style-align-${layer.id}`,
          category: 'style-consistency',
          title: `Alignment deviation from ${style.name}`,
          currentValue: layer.textAlign,
          requiredValue: style.rules.preferredAlignments.join(' or '),
          explanation: `The ${style.name} profile prefers ${style.rules.preferredAlignments.join(' and ')} alignment for a consistent hierarchy.`,
          fixActionLabel: `Align ${style.rules.preferredAlignments[0]}`,
          layerId: layer.id,
          isFixable: true,
          confidence: 'optional',
        });
      }

      if (layer.fill && !style.palette.includes(layer.fill.toUpperCase()) && layer.fill !== '#FFFFFF' && layer.fill !== '#000000') {
        findings.push({
          id: `style-color-${layer.id}`,
          category: 'style-consistency',
          title: `Off-palette color on "${layer.name}"`,
          currentValue: layer.fill,
          requiredValue: `${style.name} Monochrome Palette`,
          explanation: `Color does not match the approved monochrome palette of ${style.name}.`,
          fixActionLabel: 'Map to palette accent (#FFFFFF)',
          layerId: layer.id,
          isFixable: true,
          confidence: 'optional',
        });
      }
    }
  }

  if (style) {
    const usedColors = new Set(
      design.layers
        .filter((layer) => layer.visible && layer.fill)
        .map((layer) => layer.fill.toUpperCase()),
    );
    if (usedColors.size > style.rules.maxColors) {
      findings.push({
        id: 'style-color-count',
        category: 'style-consistency',
        title: `Too many colors for ${style.name}`,
        currentValue: `${usedColors.size} colors`,
        requiredValue: `${style.rules.maxColors} colors or fewer`,
        explanation: `The ${style.name} profile limits the number of active colors to keep the visual system coherent.`,
        fixActionLabel: 'Reduce colors manually',
        isFixable: false,
        confidence: 'must',
      });
    }
  }

  return findings;
}

// Applies a specific fix to the design and returns updated design
export function applyFixToDesign(design: Design, finding: ReviewFinding): Design {
  const updatedLayers = design.layers.map((layer) => {
    if (layer.id !== finding.layerId) return layer;

    const copy = { ...layer };
    const style = design.styleId ? STYLE_PROFILES.find(s => s.id === design.styleId) : null;
    const marginThreshold = style?.rules.defaultMargin || 28;

    switch (finding.category) {
      case 'contrast':
        copy.fill = '#FFFFFF';
        break;
      case 'text-size':
        copy.fontSize = style?.rules.minBodyFontSize || 14;
        break;
      case 'spacing':
        if (copy.x < marginThreshold) copy.x = marginThreshold;
        if (copy.y < marginThreshold) copy.y = marginThreshold;
        break;
      case 'crop':
        copy.x = copy.width >= design.width ? 0 : Math.min(Math.max(copy.x, 0), design.width - copy.width);
        copy.y = copy.height >= design.height ? 0 : Math.min(Math.max(copy.y, 0), design.height - copy.height);
        break;
      case 'alignment':
        {
          const grid = style?.rules.gridSpacing || 8;
          copy.x = Math.round(copy.x / grid) * grid;
          copy.y = Math.round(copy.y / grid) * grid;
        }
        break;
      case 'style-consistency':
        if (finding.title.includes('Font') && style) {
          copy.fontFamily = style.primaryFont;
        } else if (finding.title.includes('Alignment') && style) {
          copy.textAlign = style.rules.preferredAlignments[0];
        } else {
          copy.fill = '#FFFFFF';
        }
        break;
    }
    return copy;
  });

  return {
    ...design,
    layers: updatedLayers,
    updatedAt: Date.now(),
  };
}

// Applies all high-confidence fixes
export function applyAllFixesToDesign(design: Design, findings: ReviewFinding[]): Design {
  let currentDesign = design;
  for (const finding of findings) {
    if (finding.isFixable && finding.confidence === 'must') {
      currentDesign = applyFixToDesign(currentDesign, finding);
    }
  }
  return currentDesign;
}

