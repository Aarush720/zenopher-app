import { Design } from '../types';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('An image layer could not be decoded.'));
    image.src = src;
  });
}

/** Renders the same editable model used by ExportModal into a PNG for critique. */
export async function renderDesignToPng(design: Design, maxDimension = 1024): Promise<Blob> {
  const scale = Math.min(1, maxDimension / Math.max(design.width, design.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(16, Math.round(design.width * scale));
  canvas.height = Math.max(16, Math.round(design.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The browser could not create an export canvas.');

  context.scale(scale, scale);
  context.fillStyle = design.background || '#111111';
  context.fillRect(0, 0, design.width, design.height);

  for (const layer of design.layers) {
    if (!layer.visible) continue;
    context.save();
    context.globalAlpha = layer.opacity ?? 1;
    if (layer.rotation) {
      const centerX = layer.x + layer.width / 2;
      const centerY = layer.y + layer.height / 2;
      context.translate(centerX, centerY);
      context.rotate((layer.rotation * Math.PI) / 180);
      context.translate(-centerX, -centerY);
    }

    if (layer.type === 'rect') {
      context.fillStyle = layer.fill || '#2C2C2C';
      const radius = layer.borderRadius || 0;
      if (radius > 0) {
        context.beginPath();
        context.roundRect(layer.x, layer.y, layer.width, layer.height, radius);
        context.fill();
        if (layer.stroke && layer.strokeWidth) {
          context.lineWidth = layer.strokeWidth;
          context.strokeStyle = layer.stroke;
          context.stroke();
        }
      } else {
        context.fillRect(layer.x, layer.y, layer.width, layer.height);
      }
    } else if (layer.type === 'circle') {
      context.fillStyle = layer.fill || '#2C2C2C';
      context.beginPath();
      context.ellipse(layer.x + layer.width / 2, layer.y + layer.height / 2, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
      context.fill();
    } else if (layer.type === 'text') {
      context.fillStyle = layer.fill || '#FFFFFF';
      context.font = `${layer.fontWeight || '400'} ${layer.fontSize || 20}px "${layer.fontFamily || 'Lufga'}", sans-serif`;
      context.textBaseline = 'top';
      context.textAlign = layer.textAlign || 'left';
      context.fillText(layer.text || '', layer.x, layer.y);
    } else if (layer.type === 'image' && layer.imageUrl) {
      const image = await loadImage(layer.imageUrl);
      context.drawImage(image, layer.x, layer.y, layer.width, layer.height);
    } else if (layer.type === 'triangle') {
      context.fillStyle = layer.fill || '#2C2C2C';
      context.beginPath();
      context.moveTo(layer.x + layer.width / 2, layer.y);
      context.lineTo(layer.x + layer.width, layer.y + layer.height);
      context.lineTo(layer.x, layer.y + layer.height);
      context.closePath();
      context.fill();
    } else if (layer.type === 'star') {
      context.fillStyle = layer.fill || '#2C2C2C';
      context.beginPath();
      for (let point = 0; point < 10; point += 1) {
        const radius = point % 2 === 0 ? 0.5 : 0.22;
        const angle = -Math.PI / 2 + (point * Math.PI) / 5;
        const x = layer.x + layer.width / 2 + Math.cos(angle) * layer.width * radius;
        const y = layer.y + layer.height / 2 + Math.sin(angle) * layer.height * radius;
        if (point === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
    } else if (layer.type === 'frame') {
      context.strokeStyle = layer.stroke || layer.fill || '#FFFFFF';
      context.lineWidth = layer.strokeWidth || 4;
      context.strokeRect(layer.x, layer.y, layer.width, layer.height);
    }
    context.restore();
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The browser could not encode the design as PNG.')), 'image/png');
  });
}
