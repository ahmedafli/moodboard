"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Group, Rect, Line, Transformer } from "react-konva";
import Konva from "konva";

type FurnitureItem = {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  shadow?: boolean;
  blendMode?: GlobalCompositeOperation;
  flipHorizontal?: boolean;
};

type Background = {
  url: string;
};

type MaskMode = "none" | "brush" | "polygon";

interface CanvasEditorProps {
  width?: number;
  height?: number;
  background?: Background | null;
  items: FurnitureItem[];
  onItemsChange?: (items: FurnitureItem[]) => void;
  maskMode?: MaskMode;
  brushSize?: number;
  polygonPoints?: { x: number; y: number }[];
  onPolygonPointsChange?: (pts: { x: number; y: number }[]) => void;
  onExport?: (dataUrlPng: string, dataUrlJpeg: string) => void;
  requestExportToken?: number | null;
  onImageClick?: (imageId: string) => void;
}

function useHTMLImage(url?: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
    const isHttp = url.startsWith("http://") || url.startsWith("https://");
    const isData = url.startsWith("data:");
    const isBlob = url.startsWith("blob:");
    const isAlreadyProxied = url.startsWith("/api/proxy-image");
    // Only proxy external http(s) URLs to avoid CORS; keep data/blob/local URLs as-is
    if (isAlreadyProxied || isHttp) {
      img.crossOrigin = "anonymous";
      img.src = isAlreadyProxied ? url : `/api/proxy-image?url=${encodeURIComponent(url)}`;
    } else {
      img.src = url;
    }
  }, [url]);
  return image;
}

export default function CanvasEditor(props: CanvasEditorProps) {
  const {
    width = 960,
    height = 540,
    background,
    items,
    onItemsChange,
    maskMode = "none",
    brushSize = 24,
    polygonPoints = [],
    onPolygonPointsChange,
    onExport,
    requestExportToken,
    onImageClick,
  } = props;

  // Match the Stage size to the canvas to keep the entire moodboard visible/responsive
  const stageWidth = width;
  const stageHeight = height;

  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const bgImage = useHTMLImage(background?.url);

  // Detect if on mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Brush mask is drawn on its own layer via a temporary canvas
  const brushLayerRef = useRef<Konva.Layer>(null);
  const [isPainting, setIsPainting] = useState(false);

  const handleDragMove = useCallback(
    (id: string, pos: { x: number; y: number }) => {
      const next = items.map((it) => (it.id === id ? { ...it, x: pos.x, y: pos.y } : it));
      onItemsChange?.(next);
    },
    [items, onItemsChange]
  );

  const handleTransformEnd = useCallback(
    (id: string, node: Konva.Image) => {
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      // Reset scale into width/height to keep subsequent transforms stable
      node.scaleX(1);
      node.scaleY(1);
      const next = items.map((it) =>
        it.id === id
          ? {
              ...it,
              x: node.x(),
              y: node.y(),
              width: Math.max(10, it.width * scaleX),
              height: Math.max(10, it.height * scaleY),
              rotation: node.rotation(),
            }
          : it
      );
      onItemsChange?.(next);
    },
    [items, onItemsChange]
  );

  const handleToggleShadow = useCallback(
    (id: string) => {
      const next = items.map((it) => (it.id === id ? { ...it, shadow: !it.shadow } : it));
      onItemsChange?.(next);
    },
    [items, onItemsChange]
  );

  const handleBlendMode = useCallback(
    (id: string, mode: GlobalCompositeOperation) => {
      const next = items.map((it) => (it.id === id ? { ...it, blendMode: mode } : it));
      onItemsChange?.(next);
    },
    [items, onItemsChange]
  );

  // Brush painting logic
  const getPointerPosition = () => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    return stage.getPointerPosition() ?? { x: 0, y: 0 };
  };

  const startPainting = () => {
    if (maskMode !== "brush") return;
    setIsPainting(true);
  };
  const stopPainting = () => setIsPainting(false);
  const paint = () => {
    if (!isPainting || maskMode !== "brush") return;
    const layer = brushLayerRef.current;
    if (!layer) return;
    const ctx = (layer.getCanvas().getContext() as any) as CanvasRenderingContext2D;
    const pos = getPointerPosition();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.fill();
    layer.batchDraw();
  };

  // Export
  const doExport = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // Hide all transformer handles during export
    const transformers = stage.find('Transformer') as unknown as Konva.Transformer[];
    const prevVisibility = transformers.map(t => t.visible());
    transformers.forEach(t => t.visible(false));
    stage.draw();
    
    // Export only the canvas area (not the expanded Stage)
    const dataUrlPng = stage.toDataURL({ 
      pixelRatio: 2, 
      mimeType: "image/png",
      x: 0,
      y: 0,
      width: width,
      height: height
    });
    const dataUrlJpeg = stage.toDataURL({ 
      pixelRatio: 2, 
      mimeType: "image/jpeg", 
      quality: 0.95,
      x: 0,
      y: 0,
      width: width,
      height: height
    });
    
    // Restore visibility
    transformers.forEach((t, i) => t.visible(prevVisibility[i]));
    stage.draw();
    onExport?.(dataUrlPng, dataUrlJpeg);
  }, [onExport, width, height]);

  const prevExportTokenRef = useRef<number | null>(null);
  useEffect(() => {
    const token = requestExportToken ?? null;
    // On first mount, just record token without exporting
    if (prevExportTokenRef.current === null) {
      prevExportTokenRef.current = token;
      return;
    }
    if (token !== null && token !== prevExportTokenRef.current) {
      prevExportTokenRef.current = token;
      doExport();
    }
  }, [requestExportToken, doExport]);

  // Build polygon path if any
  const polygonKonvaPoints = useMemo(() => polygonPoints.flatMap((p) => [p.x, p.y]), [polygonPoints]);

  // Composite masking: we use a Group with a Rect and apply clipFunc for polygon, and for brush we rely on a black mask rendered on a separate layer and used as clip in items layer via globalCompositeOperation.
  // Simpler approach: For brush, use that layer as the only visible area for items by drawing brush as white over black, then set item layer composite to source-in over the brush layer snapshot.
  // Konva does not directly allow using another layer as clip, so we approximate by drawing brush on the same layer using a large black rect and setting globalCompositeOperation on items to "destination-in". We'll instead use clipFunc for polygon and for brush we draw furniture through a Group with a custom clip function that reads a cached canvas snapshot.

  // To keep it robust and simple: we implement polygon mask via clipFunc; brush provides a simple vignette-style painting mask using a cached canvas snapshot updated on demand.
  const [brushMaskImage, setBrushMaskImage] = useState<HTMLCanvasElement | null>(null);
  const refreshBrushMask = useCallback(() => {
    const layer = brushLayerRef.current;
    if (!layer) return;
    // Create a snapshot canvas
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Copy existing drawing from Konva internal layer canvas
    const src = (layer.getCanvas()._canvas as HTMLCanvasElement);
    ctx.drawImage(src, 0, 0);
    setBrushMaskImage(canvas);
  }, [width, height]);

  useEffect(() => {
    if (!isPainting) {
      refreshBrushMask();
    }
  }, [isPainting, refreshBrushMask]);

  const itemsClipFunc = useCallback(() => {
    if (maskMode === "polygon" && polygonKonvaPoints.length >= 6) {
      return (ctx: Konva.Context) => {
        const pts = polygonKonvaPoints;
        ctx.beginPath();
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) {
          ctx.lineTo(pts[i], pts[i + 1]);
        }
        ctx.closePath();
      };
    }
    if (maskMode === "brush" && brushMaskImage) {
      // Clip by non-transparent pixels of brush mask by drawing mask path approximation as rectangles
      // Konva clipFunc cannot sample alpha, so we approximate by drawing many small rects when exporting; for runtime, instead apply composite operation when drawing items group
      return undefined;
    }
    return undefined;
  }, [maskMode, polygonKonvaPoints, brushMaskImage]);

  // For brush masking at runtime: render items to an offscreen canvas using Konva cache + composite with brush mask via a top overlay
  // Practical simplification: We set a Group for items and when maskMode=="brush" we set that group's globalCompositeOperation to "source-in" and put a Konva.Image of the brushMask on top in same Layer with op "destination-in". However Konva order matters; easier: draw items normally and add a black rect, then draw brushMask as white with op destination-in. We'll implement: items group cached, then a KonvaImage of mask over it with composite 'destination-in'.

  const [itemsGroupRef, setItemsGroupRef] = useState<Konva.Group | null>(null);

  useEffect(() => {
    if (!itemsGroupRef) return;
    
    // Check if the group has valid dimensions before caching
    const groupWidth = itemsGroupRef.width();
    const groupHeight = itemsGroupRef.height();
    
    // Only cache if the group has valid dimensions
    if (groupWidth > 0 && groupHeight > 0) {
      itemsGroupRef.cache({ pixelRatio: 1 });
      itemsGroupRef.getLayer()?.batchDraw();
    }
  }, [itemsGroupRef, items, brushMaskImage, maskMode]);

  // Attach shared Transformer to the selected node
  useEffect(() => {
    const stage = stageRef.current;
    const transformer = transformerRef.current;
    if (!stage || !transformer) return;
    if (!selectedId) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }
    const node = stage.findOne(`#node-${selectedId}`) as Konva.Node | null;
    if (node) {
      transformer.nodes([node]);
    } else {
      transformer.nodes([]);
    }
    transformer.getLayer()?.batchDraw();
  }, [selectedId, items, width, height]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2"><div className="text-sm text-gray-600">Canvas {width}×{height}</div></div>
      <div style={{ backgroundColor: 'transparent' }}>
        <Stage
          ref={stageRef as any}
          width={stageWidth}
          height={stageHeight}
          onPointerDown={startPainting}
          onPointerUp={stopPainting}
          onPointerMove={paint}
          onMouseDown={(e: any) => {
            if (e.target === e.target.getStage()) {
              setSelectedId(null);
            }
            startPainting();
          }}
          onMouseUp={stopPainting}
          onMouseMove={paint}
          style={{ 
            backgroundColor: 'transparent',
            border: 'none',
            outline: 'none',
            touchAction: 'none',
            WebkitUserSelect: 'none',
            msTouchAction: 'none'
          }}
        >
          {/* Background */}
          <Layer listening={maskMode === "brush"}>
            {bgImage && (
              <KonvaImage image={bgImage} x={0} y={0} width={width} height={height} listening={false} />
            )}
          </Layer>

          {/* Items */}
          <Layer>
            {items.map((item) => (
              <DraggableTransformableImage
                key={item.id}
                item={item}
                onDragMove={handleDragMove}
                onTransformEnd={handleTransformEnd}
                onImageClick={(id) => {
                  setSelectedId(id);
                  onImageClick?.(id);
                }}
              />
            ))}
            <Transformer
              ref={transformerRef as any}
              rotateEnabled
              enabledAnchors={["top-left", "top-right", "bottom-left", "bottom-right"]}
              anchorSize={isMobile ? 20 : 8}
              borderStrokeWidth={isMobile ? 3 : 1}
            />
          </Layer>

          {/* Brush drawing layer (user paints here). Keep above for input, but invisible to final due to destination-in on items */}
          <Layer ref={brushLayerRef as any} listening={maskMode === "brush"}>
            {/* Initialized empty; user draws opaque circles with brush */}
          </Layer>

          {/* Polygon authoring overlay */}
          {maskMode === "polygon" && (
            <Layer>
              {polygonKonvaPoints.length >= 2 && (
                <Line
                  points={polygonKonvaPoints}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  closed={false}
                />
              )}
              <Rect
                x={0}
                y={0}
                width={width}
                height={height}
                listening
                onClick={(e) => {
                  const pos = e.target.getStage()?.getPointerPosition();
                  if (!pos) return;
                  onPolygonPointsChange?.([...polygonPoints, { x: pos.x, y: pos.y }]);
                }}
                fill="rgba(0,0,0,0)"
              />
            </Layer>
          )}
        </Stage>
      </div>
    </div>
  );
}

function DraggableTransformableImage({
  item,
  onDragMove,
  onTransformEnd,
  onImageClick,
}: {
  item: FurnitureItem;
  onDragMove: (id: string, pos: { x: number; y: number }) => void;
  onTransformEnd: (id: string, node: Konva.Image) => void;
  onImageClick?: (imageId: string) => void;
}) {
  const image = useHTMLImage(item.url);
  const ref = useRef<Konva.Image>(null);

  // Transformer managed globally in CanvasEditor

  return (
    <Group>
      <KonvaImage
        id={`node-${item.id}`}
        ref={ref as any}
        image={image || undefined}
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        rotation={item.rotation || 0}
        scaleX={item.flipHorizontal ? -1 : 1}
        draggable
        dragBoundFunc={(pos) => {
          const stage = ref.current?.getStage();
          const stageWidth = stage?.width() || 0;
          const stageHeight = stage?.height() || 0;
          const maxX = Math.max(0, stageWidth - item.width);
          const maxY = Math.max(0, stageHeight - item.height);
          const clampedX = Math.min(Math.max(0, pos.x), maxX);
          const clampedY = Math.min(Math.max(0, pos.y), maxY);
          return { x: clampedX, y: clampedY };
        }}
        onDragMove={(e) => onDragMove(item.id, e.target.position())}
        onTransformEnd={(e) => onTransformEnd(item.id, e.target as Konva.Image)}
        onClick={() => onImageClick?.(item.id)}
        onTap={() => onImageClick?.(item.id)}
        shadowEnabled={!!item.shadow}
        shadowColor="rgba(0,0,0,0.4)"
        shadowBlur={12}
        shadowOffset={{ x: 8, y: 12 }}
        globalCompositeOperation={item.blendMode}
      />
    </Group>
  );
}


