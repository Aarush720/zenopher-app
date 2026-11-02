import React, { useState } from 'react';
import { X, Download, FileCode, Image as ImageIcon, FileText, Check } from 'lucide-react';
import { Design } from '../types';
import { storage } from '../services/storage';

function escapeXml(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '\"': '&quot;',
  })[character] || character);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('An image layer could not be decoded during export'));
    image.src = src;
  });
}

interface ExportModalProps {
  isOpen: boolean;
  design: Design;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  design,
  onClose,
}) => {
  const [format, setFormat] = useState<'zph' | 'png' | 'svg'>('png');
  const [scale, setScale] = useState<number>(1);
  const [includeBackground, setIncludeBackground] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);

    try {
      if (format === 'zph') {
        storage.exportZPH(design);
      } else if (format === 'png') {
        // Draw to offscreen canvas
        const canvas = document.createElement('canvas');
        canvas.width = design.width * scale;
        canvas.height = design.height * scale;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.scale(scale, scale);

          // Draw background if requested
          if (includeBackground) {
            ctx.fillStyle = design.background || '#111111';
            ctx.fillRect(0, 0, design.width, design.height);
          }

          // Draw layers bottom to top
          for (const layer of design.layers) {
            if (!layer.visible) continue;
            ctx.save();
            ctx.globalAlpha = layer.opacity ?? 1;

            if (layer.rotation) {
              const cx = layer.x + layer.width / 2;
              const cy = layer.y + layer.height / 2;
              ctx.translate(cx, cy);
              ctx.rotate((layer.rotation * Math.PI) / 180);
              ctx.translate(-cx, -cy);
            }

            if (layer.type === 'rect') {
              ctx.fillStyle = layer.fill || '#2C2C2C';
              const r = layer.borderRadius || 0;
              if (r > 0) {
                ctx.beginPath();
                ctx.roundRect(layer.x, layer.y, layer.width, layer.height, r);
                ctx.fill();
                if (layer.stroke && layer.strokeWidth) {
                  ctx.lineWidth = layer.strokeWidth;
                  ctx.strokeStyle = layer.stroke;
                  ctx.stroke();
                }
              } else {
                ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
                if (layer.stroke && layer.strokeWidth) {
                  ctx.lineWidth = layer.strokeWidth;
                  ctx.strokeStyle = layer.stroke;
                  ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
                }
              }
            } else if (layer.type === 'circle') {
              ctx.fillStyle = layer.fill || '#2C2C2C';
              ctx.beginPath();
              ctx.ellipse(
                layer.x + layer.width / 2,
                layer.y + layer.height / 2,
                layer.width / 2,
                layer.height / 2,
                0,
                0,
                2 * Math.PI
              );
              ctx.fill();
              if (layer.stroke && layer.strokeWidth) {
                ctx.lineWidth = layer.strokeWidth;
                ctx.strokeStyle = layer.stroke;
                ctx.stroke();
              }
            } else if (layer.type === 'text') {
              ctx.fillStyle = layer.fill || '#FFFFFF';
              ctx.font = `${layer.fontWeight || '400'} ${layer.fontSize || 20}px "${layer.fontFamily || 'Lufga'}", sans-serif`;
              ctx.textBaseline = 'top';
              ctx.textAlign = layer.textAlign || 'left';
              ctx.fillText(layer.text || '', layer.x, layer.y);
            } else if (layer.type === 'image' && layer.imageUrl) {
              const image = await loadImage(layer.imageUrl);
              ctx.drawImage(image, layer.x, layer.y, layer.width, layer.height);
            } else if (layer.type === 'triangle') {
              ctx.fillStyle = layer.fill || '#2C2C2C';
              ctx.beginPath();
              ctx.moveTo(layer.x + layer.width / 2, layer.y);
              ctx.lineTo(layer.x + layer.width, layer.y + layer.height);
              ctx.lineTo(layer.x, layer.y + layer.height);
              ctx.closePath();
              ctx.fill();
            } else if (layer.type === 'star') {
              ctx.fillStyle = layer.fill || '#2C2C2C';
              ctx.beginPath();
              for (let point = 0; point < 10; point += 1) {
                const radius = point % 2 === 0 ? 0.5 : 0.22;
                const angle = -Math.PI / 2 + (point * Math.PI) / 5;
                const x = layer.x + layer.width / 2 + Math.cos(angle) * layer.width * radius;
                const y = layer.y + layer.height / 2 + Math.sin(angle) * layer.height * radius;
                if (point === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              }
              ctx.closePath();
              ctx.fill();
            } else if (layer.type === 'frame') {
              ctx.strokeStyle = layer.stroke || layer.fill || '#FFFFFF';
              ctx.lineWidth = layer.strokeWidth || 4;
              ctx.strokeRect(layer.x, layer.y, layer.width, layer.height);
            }

            ctx.restore();
          }

          // Trigger PNG download
          const url = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = url;
          a.download = `${design.title.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'design'}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } else if (format === 'svg') {
        // Generate SVG markup
        const svgContent = `
          <svg xmlns="http://www.w3.org/2000/svg" width="${design.width}" height="${design.height}" viewBox="0 0 ${design.width} ${design.height}">
            ${includeBackground ? `<rect width="100%" height="100%" fill="${escapeXml(design.background || '#111111')}"/>` : ''}
            ${design.layers
              .filter((l) => l.visible)
              .map((l) => {
                if (l.type === 'rect') {
                  return `<rect x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" rx="${l.borderRadius || 0}" fill="${escapeXml(l.fill || '#2C2C2C')}" opacity="${l.opacity ?? 1}" ${l.stroke ? `stroke="${escapeXml(l.stroke)}" stroke-width="${l.strokeWidth || 1}"` : ''} transform="rotate(${l.rotation || 0} ${l.x + l.width / 2} ${l.y + l.height / 2})"/>`;
                }
                if (l.type === 'circle') {
                  return `<ellipse cx="${l.x + l.width / 2}" cy="${l.y + l.height / 2}" rx="${l.width / 2}" ry="${l.height / 2}" fill="${escapeXml(l.fill || '#2C2C2C')}" opacity="${l.opacity ?? 1}" ${l.stroke ? `stroke="${escapeXml(l.stroke)}" stroke-width="${l.strokeWidth || 1}"` : ''} transform="rotate(${l.rotation || 0} ${l.x + l.width / 2} ${l.y + l.height / 2})"/>`;
                }
                if (l.type === 'text') {
                  return `<text x="${l.x}" y="${l.y + (l.fontSize || 16)}" fill="${escapeXml(l.fill || '#FFFFFF')}" font-size="${l.fontSize || 16}" font-family="${escapeXml(l.fontFamily || 'Lufga')}" font-weight="${escapeXml(l.fontWeight || '400')}" text-anchor="${l.textAlign === 'center' ? 'middle' : l.textAlign === 'right' ? 'end' : 'start'}" opacity="${l.opacity ?? 1}" transform="rotate(${l.rotation || 0} ${l.x + l.width / 2} ${l.y + l.height / 2})">${escapeXml(l.text || '')}</text>`;
                }
                if (l.type === 'image' && l.imageUrl) {
                  return `<image href="${escapeXml(l.imageUrl)}" x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" opacity="${l.opacity ?? 1}" preserveAspectRatio="none" transform="rotate(${l.rotation || 0} ${l.x + l.width / 2} ${l.y + l.height / 2})"/>`;
                }
                if (l.type === 'triangle') {
                  return `<polygon points="${l.x + l.width / 2},${l.y} ${l.x + l.width},${l.y + l.height} ${l.x},${l.y + l.height}" fill="${escapeXml(l.fill || '#2C2C2C')}" opacity="${l.opacity ?? 1}" transform="rotate(${l.rotation || 0} ${l.x + l.width / 2} ${l.y + l.height / 2})"/>`;
                }
                if (l.type === 'frame') {
                  return `<rect x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" fill="none" stroke="${escapeXml(l.stroke || l.fill || '#FFFFFF')}" stroke-width="${l.strokeWidth || 4}" opacity="${l.opacity ?? 1}" transform="rotate(${l.rotation || 0} ${l.x + l.width / 2} ${l.y + l.height / 2})"/>`;
                }
                return '';
              })
              .join('\n')}
          </svg>
        `;
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${design.title.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'design'}.svg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } finally {
      setIsExporting(false);
      onClose();
    }
  };

  return (
    <div 
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: '480px' }} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 style={{ fontSize: '17px', fontWeight: 700 }}>Export Design</h2>
          <button 
            className="btn-square" 
            style={{ width: '36px', height: '36px' }} 
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Format Selection Tiles */}
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              Export Format
            </label>
            <div className="grid-3">
              <div
                className={`tile ${format === 'png' ? 'selected' : ''}`}
                style={{ height: '90px' }}
                onClick={() => setFormat('png')}
              >
                <ImageIcon size={24} style={{ marginBottom: '6px' }} />
                <span style={{ fontSize: '13px', fontWeight: 700 }}>PNG</span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>Raster Image</span>
              </div>

              <div
                className={`tile ${format === 'zph' ? 'selected' : ''}`}
                style={{ height: '90px' }}
                onClick={() => setFormat('zph')}
              >
                <FileCode size={24} style={{ marginBottom: '6px' }} />
                <span style={{ fontSize: '13px', fontWeight: 700 }}>.ZPH</span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>Zenopher Project</span>
              </div>

              <div
                className={`tile ${format === 'svg' ? 'selected' : ''}`}
                style={{ height: '90px' }}
                onClick={() => setFormat('svg')}
              >
                <FileText size={24} style={{ marginBottom: '6px' }} />
                <span style={{ fontSize: '13px', fontWeight: 700 }}>SVG</span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>Vector Graphic</span>
              </div>
            </div>
          </div>

          {/* Scale Resolution (PNG only) */}
          {format === 'png' && (
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                Resolution Scale
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[1, 2, 3].map((s) => (
                  <button
                    key={s}
                    className={scale === s ? 'selected' : ''}
                    style={{ height: '40px', fontSize: '13px', fontWeight: 600, borderRadius: '6px' }}
                    onClick={() => setScale(s)}
                  >
                    {s}× ({design.width * s} × {design.height * s} px)
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Background Toggle */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              background: 'var(--container)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-control)',
            }}
          >
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, display: 'block' }}>Canvas Background</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Include {design.background || '#111111'} in exported asset</span>
            </div>
            <button
              className={includeBackground ? 'selected' : ''}
              style={{ width: '44px', height: '28px', borderRadius: '6px', padding: 0 }}
              onClick={() => setIncludeBackground(!includeBackground)}
            >
              {includeBackground ? <Check size={14} /> : null}
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button
            style={{
              height: '44px',
              padding: '0 20px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: 'var(--radius-control)',
              background: 'transparent',
              color: 'var(--text-secondary)',
            }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="primary"
            disabled={isExporting}
            style={{
              height: '44px',
              padding: '0 24px',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: 'var(--radius-control)',
              gap: '8px',
            }}
            onClick={handleExport}
          >
            <Download size={16} />
            <span>{isExporting ? 'Exporting...' : 'Download Export'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

