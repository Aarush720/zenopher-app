import React, { useState, useRef, useEffect } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Grid, 
  Compass, 
  Eye, 
  MousePointer, 
  Move
} from 'lucide-react';
import { Design, Layer } from '../../types';

interface FloatingCanvasWorkspaceProps {
  design: Design;
  selectedLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onUpdateLayer: (id: string, updates: Partial<Layer>) => void;
  onCanvasReady?: (workspaceRect?: DOMRect) => void;
}

export const FloatingCanvasWorkspace: React.FC<FloatingCanvasWorkspaceProps> = ({
  design,
  selectedLayerId,
  onSelectLayer,
  onUpdateLayer,
  onCanvasReady,
}) => {
  const [zoom, setZoom] = useState<number>(0.65);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showGuides, setShowGuides] = useState<boolean>(true);
  const [isPreview, setIsPreview] = useState<boolean>(false);
  const [isCanvasReady, setIsCanvasReady] = useState<boolean>(false);

  // Dragging state
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; layerX: number; layerY: number }>({
    x: 0,
    y: 0,
    layerX: 0,
    layerY: 0,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const artboardRef = useRef<HTMLDivElement>(null);
  const onCanvasReadyRef = useRef(onCanvasReady);
  const imageSignature = design.layers
    .filter((layer) => layer.type === 'image' && layer.imageUrl)
    .map((layer) => layer.imageUrl)
    .join('|');

  useEffect(() => {
    onCanvasReadyRef.current = onCanvasReady;
  }, [onCanvasReady]);

  // Auto-fit artboard on mount
  useEffect(() => {
    handleFitToScreen();
  }, [design.width, design.height]);

  useEffect(() => {
    let cancelled = false;
    setIsCanvasReady(false);

    const imageSources = imageSignature ? imageSignature.split('|') : [];
    const imageLoads = imageSources.map((source) => new Promise<void>((resolve) => {
      const image = new window.Image();
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = source;
    }));

    Promise.all(imageLoads).then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) {
            setIsCanvasReady(true);
            onCanvasReadyRef.current?.(containerRef.current?.parentElement?.getBoundingClientRect());
          }
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [design.id, design.width, design.height, imageSignature]);

  const handleFitToScreen = () => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth - 80;
    const containerHeight = containerRef.current.clientHeight - 80;

    const scaleX = containerWidth / design.width;
    const scaleY = containerHeight / design.height;
    const fitScale = Math.min(scaleX, scaleY, 1.0);
    setZoom(Math.max(0.15, Math.min(fitScale, 1.5)));
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(2.5, +(prev + 0.1).toFixed(2)));
  const handleZoomOut = () => setZoom((prev) => Math.max(0.2, +(prev - 0.1).toFixed(2)));

  // Layer Dragging logic
  const handlePointerDownOnLayer = (e: React.PointerEvent<HTMLDivElement>, layer: Layer) => {
    if (layer.locked || isPreview) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelectLayer(layer.id);
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      layerX: layer.x,
      layerY: layer.y,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!isDragging || !selectedLayerId) return;
    const selectedLayer = design.layers.find((l) => l.id === selectedLayerId);
    if (!selectedLayer || selectedLayer.locked) return;

    const dx = (e.clientX - dragStart.x) / zoom;
    const dy = (e.clientY - dragStart.y) / zoom;

    onUpdateLayer(selectedLayerId, {
      x: Math.round(dragStart.layerX + dx),
      y: Math.round(dragStart.layerY + dy),
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const selectedLayer = design.layers.find((l) => l.id === selectedLayerId);

  return (
    <main 
      className="floating-panel"
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={() => onSelectLayer(null)}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        background: 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      {!isCanvasReady && (
        <div className="canvas-loader" role="status" aria-label="Loading canvas">
          <span className="canvas-loader-ring" />
          <span>Loading canvas</span>
        </div>
      )}

      {/* Top Floating Viewport Toolbar */}
      <div 
        className="canvas-toolbar"
        style={{
          position: 'absolute',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          background: 'var(--on-surface)',
          padding: '6px 10px',
          borderRadius: 'var(--radius-control)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="btn-square"
          style={{ width: '32px', height: '32px' }}
          onClick={handleZoomOut}
          title="Zoom Out"
        >
          <ZoomOut size={15} />
        </button>

        <span 
          style={{ 
            fontSize: '11px', 
            fontWeight: 600, 
            width: '42px', 
            textAlign: 'center', 
            fontFamily: 'var(--font-mono)',
            color: 'var(--text)' 
          }}
        >
          {Math.round(zoom * 100)}%
        </span>

        <button
          className="btn-square"
          style={{ width: '32px', height: '32px' }}
          onClick={handleZoomIn}
          title="Zoom In"
        >
          <ZoomIn size={15} />
        </button>

        <div style={{ width: '1px', height: '18px', background: 'var(--container)' }} />

        <button
          className="btn-square"
          style={{ width: '32px', height: '32px' }}
          onClick={handleFitToScreen}
          title="Fit to Screen"
        >
          <Maximize2 size={15} />
        </button>

        <button
          className={`btn-square ${showGrid ? 'selected' : ''}`}
          style={{ width: '32px', height: '32px' }}
          onClick={() => setShowGrid(!showGrid)}
          title="Toggle Grid"
        >
          <Grid size={15} />
        </button>

        <button
          className={`btn-square ${showGuides ? 'selected' : ''}`}
          style={{ width: '32px', height: '32px' }}
          onClick={() => setShowGuides(!showGuides)}
          title="Toggle Guides"
        >
          <Compass size={15} />
        </button>

        <button
          className={`btn-square ${isPreview ? 'selected' : ''}`}
          style={{ width: '32px', height: '32px' }}
          onClick={() => setIsPreview(!isPreview)}
          title="Preview Mode"
        >
          <Eye size={15} />
        </button>
      </div>

      {/* Artboard Container with Pan & Center */}
      <div 
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          padding: '40px',
        }}
      >
        <div 
          id="canvas-artboard"
          ref={artboardRef}
          style={{
            width: `${design.width}px`,
            height: `${design.height}px`,
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            background: design.background || '#111111',
            borderRadius: '10px',
            position: 'relative',
            overflow: 'hidden',
            border: 'none',
            boxShadow: 'none',
            transition: isDragging ? 'none' : 'transform var(--canvas-motion)',
            willChange: 'transform',
            flexShrink: 0,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelectLayer(null);
          }}
        >
          {/* Subtle Grid Dots Overlay */}
          {showGrid && !isPreview && (
            <div 
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)`,
                backgroundSize: '24px 24px',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          )}

          {/* Guide Overlay Lines */}
          {showGuides && !isPreview && (
            <>
              {/* Margin Guide Inset */}
              <div 
                style={{
                  position: 'absolute',
                  inset: '32px',
                  border: '1px dashed rgba(255,255,255,0.15)',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              />
              {/* Center Crosshairs */}
              <div 
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  bottom: 0,
                  width: '1px',
                  background: 'rgba(255,255,255,0.06)',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              />
              <div 
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: 0,
                  right: 0,
                  height: '1px',
                  background: 'rgba(255,255,255,0.06)',
                  pointerEvents: 'none',
                  zIndex: 2,
                }}
              />
            </>
          )}

          {/* Render All Layers */}
          {design.layers.map((layer) => {
            if (!layer.visible) return null;
            const isSelected = selectedLayerId === layer.id && !isPreview;

            return (
              <div
                key={layer.id}
                onPointerDown={(e) => handlePointerDownOnLayer(e, layer)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectLayer(layer.id);
                }}
                style={{
                  position: 'absolute',
                  left: `${layer.x}px`,
                  top: `${layer.y}px`,
                  width: `${layer.width}px`,
                  height: `${layer.height}px`,
                  transform: `rotate(${layer.rotation || 0}deg)`,
                  opacity: layer.opacity ?? 1,
                  cursor: layer.locked ? 'default' : 'move',
                  zIndex: isSelected ? 20 : 5,
                  userSelect: 'none',
                }}
              >
                {/* Render Text Layer */}
                {layer.type === 'text' && (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      color: layer.fill || '#FFFFFF',
                      fontSize: `${layer.fontSize || 16}px`,
                      fontFamily: layer.fontFamily || 'Lufga',
                      fontWeight: layer.fontWeight || '400',
                      textAlign: layer.textAlign || 'left',
                      letterSpacing: `${layer.letterSpacing || 0}px`,
                      lineHeight: layer.lineHeight || 1.2,
                      display: 'flex',
                      alignItems: 'center',
                      wordBreak: 'break-word',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {layer.text || 'Add text'}
                  </div>
                )}

                {/* Render Rectangle Layer */}
                {layer.type === 'rect' && (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      backgroundColor: layer.fill || '#2C2C2C',
                      borderRadius: `${layer.borderRadius || 0}px`,
                      border: layer.stroke && layer.strokeWidth ? `${layer.strokeWidth}px solid ${layer.stroke}` : 'none',
                    }}
                  />
                )}

                {/* Render Circle Layer */}
                {layer.type === 'circle' && (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      backgroundColor: layer.fill || '#2C2C2C',
                      borderRadius: '50%',
                      border: layer.stroke && layer.strokeWidth ? `${layer.strokeWidth}px solid ${layer.stroke}` : 'none',
                    }}
                  />
                )}

                {layer.type === 'image' && layer.imageUrl && (
                  <img
                    src={layer.imageUrl}
                    alt={layer.name}
                    draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }}
                  />
                )}

                {layer.type === 'triangle' && (
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: `${layer.width / 2}px solid transparent`,
                      borderRight: `${layer.width / 2}px solid transparent`,
                      borderBottom: `${layer.height}px solid ${layer.fill || '#2C2C2C'}`,
                    }}
                  />
                )}

                {layer.type === 'star' && (
                  <svg viewBox="0 0 100 100" width="100%" height="100%" aria-label={layer.name}>
                    <polygon
                      points="50,5 61,37 95,37 67,57 78,91 50,70 22,91 33,57 5,37 39,37"
                      fill={layer.fill || '#2C2C2C'}
                      stroke={layer.stroke || 'none'}
                      strokeWidth={layer.strokeWidth || 0}
                    />
                  </svg>
                )}

                {layer.type === 'frame' && (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      border: `${layer.strokeWidth || 4}px solid ${layer.stroke || layer.fill || '#FFFFFF'}`,
                      borderRadius: `${layer.borderRadius || 0}px`,
                    }}
                  />
                )}

                {/* Selection Bounding Box (Flat monochrome, no glows or shadows) */}
                {isSelected && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: '-2px',
                      border: '1.5px solid #FFFFFF',
                      pointerEvents: 'none',
                      borderRadius: layer.type === 'circle' ? '50%' : `${(layer.borderRadius || 0) + 2}px`,
                    }}
                  >
                    {/* Bounding box square corner handles */}
                    <div style={{ position: 'absolute', top: '-4px', left: '-4px', width: '8px', height: '8px', background: 'var(--ui-selected)', borderRadius: '2px' }} />
                    <div style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', background: 'var(--ui-selected)', borderRadius: '2px' }} />
                    <div style={{ position: 'absolute', bottom: '-4px', left: '-4px', width: '8px', height: '8px', background: 'var(--ui-selected)', borderRadius: '2px' }} />
                    <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '8px', height: '8px', background: 'var(--ui-selected)', borderRadius: '2px' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
};

