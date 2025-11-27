"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getCachedProducts, loadProductsOnce } from "../lib/productsCache";
import dynamic from "next/dynamic";

const CanvasEditor = dynamic(() => import("../components/CanvasEditor"), { ssr: false });

interface Product {
  id: number;
  image: string;
  productName: string;
  itemCode: string;
  price: string;
  submittedUrl?: string;
}

interface DraggableImage {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  flipHorizontal?: boolean;
}

interface BackgroundImage {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number; // -1 for behind, 0 for same level, 1 for front
}

export default function BuilderPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([]);
  const [draggableImages, setDraggableImages] = useState<DraggableImage[]>([]);
  const [backgroundImage, setBackgroundImage] = useState<BackgroundImage | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<string>("");
  const [generateError, setGenerateError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [saveError, setSaveError] = useState<string>("");
  const [draggedImage, setDraggedImage] = useState<string | null>(null);
  const [scraped_products, setScrapedProducts] = useState<any[]>([]);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDraggingBackground, setIsDraggingBackground] = useState(false);
  const [backgroundDragOffset, setBackgroundDragOffset] = useState({ x: 0, y: 0 });
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moodboardRef = useRef<HTMLDivElement>(null);
  const hasFetchedScrapedProducts = useRef(false);
  const router = useRouter();
  
  // Check authentication synchronously to prevent flash
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem('username');
    }
    return false;
  });

  // Canvas editor state
  const [maskMode, setMaskMode] = useState<"none" | "brush" | "polygon">("none");
  const [brushSize, setBrushSize] = useState<number>(24);
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  const [exportToken, setExportToken] = useState<number>(0);
  const [canvasSize, setCanvasSize] = useState({ width: 960, height: 540 });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // 🔹 Check login state and redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  // Don't render page content if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Make moodboard canvas responsive while preserving 16:9 aspect ratio (cover the container)
  useEffect(() => {
    const updateCanvasSize = () => {
      if (!moodboardRef.current) return;
      const rect = moodboardRef.current.getBoundingClientRect();
      const aspectRatio = 16 / 9;
      // Start by filling width, then expand to ensure full height (cover behavior)
      let width = rect.width;
      let height = width / aspectRatio;

      // If height is less than container, grow to fill height instead (crop sides)
      if (height < rect.height) {
        height = rect.height;
        width = height * aspectRatio;
      }

      setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
    };

    const timeoutId = setTimeout(() => {
      updateCanvasSize();
      if (moodboardRef.current && typeof ResizeObserver !== 'undefined') {
        resizeObserverRef.current = new ResizeObserver(updateCanvasSize);
        resizeObserverRef.current.observe(moodboardRef.current);
      }
    }, 0);

    window.addEventListener('resize', updateCanvasSize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateCanvasSize);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, []);

  // Fetch scraped products via internal API (server-side proxy) when /builder page is accessed
  useEffect(() => {
    // In React 18 StrictMode, effects can run twice in dev; guard to only fetch once
    if (hasFetchedScrapedProducts.current) return;
    hasFetchedScrapedProducts.current = true;

    const fetchScrapedProducts = async () => {
      try {
        const res = await fetch("/api/scraped-products");
        const json = await res.json();

        if (!json?.success) {
          // If webhook returns 404 or any non-success, just log and treat as "no scraped products"
          console.warn(
            "Scraped products webhook did not return success:",
            json?.status,
            json?.statusText,
            json?.error
          );
          setScrapedProducts([]);
          return;
        }

        const data = json?.data ?? [];
        console.log("SCRAPED PRODUCTS:", data);
        setScrapedProducts(Array.isArray(data) ? data : [data]);
      } catch (error) {
        console.error("Error fetching scraped products:", error);
      }
    };

    fetchScrapedProducts();
  }, []);

  // Helper function to get proxied image URL for Google Drive images
  const getImageUrl = (imageUrl: string) => {
    // Check if it's a Google Drive URL
    if (imageUrl.includes('drive.google.com')) {
      return `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    }
    return imageUrl;
  };

  // Load products
  useEffect(() => {
    const init = async () => {
      const cached = getCachedProducts();
      if (cached) {
        setProducts(cached);
        return;
      }
      setIsLoadingProducts(true);
      try {
        const loaded = await loadProductsOnce();
        setProducts(loaded);
      } finally {
        setIsLoadingProducts(false);
      }
    };
    init();
  }, []);

  // Load moodboard state from localStorage on mount
  useEffect(() => {
    try {
      const savedDraggableImages = localStorage.getItem('builder_draggableImages');
      const savedBackgroundImage = localStorage.getItem('builder_backgroundImage');
      
      if (savedDraggableImages) {
        setDraggableImages(JSON.parse(savedDraggableImages));
      }
      
      if (savedBackgroundImage) {
        setBackgroundImage(JSON.parse(savedBackgroundImage));
      }
    } catch (err) {
      console.error('Error loading moodboard state:', err);
    }
  }, []);

  // Save draggable images to localStorage whenever they change
  useEffect(() => {
    if (draggableImages.length > 0) {
      localStorage.setItem('builder_draggableImages', JSON.stringify(draggableImages));
    } else {
      localStorage.removeItem('builder_draggableImages');
    }
  }, [draggableImages]);

  // Save background image to localStorage whenever it changes
  useEffect(() => {
    if (backgroundImage) {
      localStorage.setItem('builder_backgroundImage', JSON.stringify(backgroundImage));
    } else {
      localStorage.removeItem('builder_backgroundImage');
    }
  }, [backgroundImage]);

  // Sync selectedImageUrls with draggableImages
  useEffect(() => {
    const urls = Array.from(new Set(draggableImages.map(img => img.url)));
    setSelectedImageUrls(urls);
  }, [draggableImages]);

  // Count how many instances of a product are in the moodboard
  const getInstanceCount = useMemo(() => {
    const countMap = new Map<string, number>();
    draggableImages.forEach(img => {
      countMap.set(img.url, (countMap.get(img.url) || 0) + 1);
    });
    return (url: string) => countMap.get(url) || 0;
  }, [draggableImages]);

  const addToMoodboard = (imageUrl: string) => {
    // Add URL to selected list only if not already present (for generating moodboard)
    setSelectedImageUrls((prev) => (prev.includes(imageUrl) ? prev : [...prev, imageUrl]));
    
    // Always add to draggable images with random position (allows multiple instances)
    const newDraggableImage: DraggableImage = {
      id: `${imageUrl}-${Date.now()}`,
      url: imageUrl,
      x: Math.random() * 300 + 50, // Random position within moodboard
      y: Math.random() * 200 + 50,
      width: 120,
      height: 120,
    };
    setDraggableImages((prev) => [...prev, newDraggableImage]);
  };

  const removeFromMoodboard = (imageUrl: string) => {
    setSelectedImageUrls((prev) => prev.filter((u) => u !== imageUrl));
    setDraggableImages((prev) => prev.filter((img) => img.url !== imageUrl));
  };

  const handleMouseDown = (e: React.MouseEvent, imageId: string) => {
    e.preventDefault();
    const rect = moodboardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const image = draggableImages.find(img => img.id === imageId);
    if (!image) return;
    
    setDraggedImage(imageId);
    setDragOffset({
      x: e.clientX - rect.left - image.x,
      y: e.clientY - rect.top - image.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = moodboardRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    if (draggedImage) {
      const newX = e.clientX - rect.left - dragOffset.x;
      const newY = e.clientY - rect.top - dragOffset.y;
      
      setDraggableImages((prev) =>
        prev.map((img) =>
          img.id === draggedImage
            ? { ...img, x: Math.max(0, Math.min(newX, rect.width - img.width)), y: Math.max(0, Math.min(newY, rect.height - img.height)) }
            : img
        )
      );
    } else if (isDraggingBackground && backgroundImage) {
      const newX = e.clientX - rect.left - backgroundDragOffset.x;
      const newY = e.clientY - rect.top - backgroundDragOffset.y;
      
      setBackgroundImage((prev) => prev ? {
        ...prev,
        x: Math.max(-prev.width/2, Math.min(newX, rect.width - prev.width/2)),
        y: Math.max(-prev.height/2, Math.min(newY, rect.height - prev.height/2))
      } : null);
    }
  };

  const handleMouseUp = () => {
    setDraggedImage(null);
    setDragOffset({ x: 0, y: 0 });
    setIsDraggingBackground(false);
    setBackgroundDragOffset({ x: 0, y: 0 });
  };

  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = moodboardRef.current?.getBoundingClientRect();
    if (!rect || !backgroundImage) return;
    
    setIsDraggingBackground(true);
    setBackgroundDragOffset({
      x: e.clientX - rect.left - backgroundImage.x,
      y: e.clientY - rect.top - backgroundImage.y,
    });
  };

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const url = event.target?.result as string;
      const rect = moodboardRef.current?.getBoundingClientRect();
      
      setBackgroundImage({
        url,
        x: rect ? rect.width / 2 - 200 : 100, // Center initially
        y: rect ? rect.height / 2 - 150 : 100,
        width: 400,
        height: 300,
        zIndex: -1, // Behind other images by default
      });
    };
    reader.readAsDataURL(file);
    
    // Clear the input so the same file can be uploaded again
    if (e.target) {
      e.target.value = '';
    }
  };

  const removeBackgroundImage = () => {
    setBackgroundImage(null);
  };

  const clearMoodboard = () => {
    if (confirm('Are you sure you want to clear the entire moodboard? All items will be removed.')) {
      setDraggableImages([]);
      setBackgroundImage(null);
      setSelectedImageId(null);
      localStorage.removeItem('builder_draggableImages');
      localStorage.removeItem('builder_backgroundImage');
    }
  };

  const rotateImageLeft = (imageId: string) => {
    setDraggableImages((prev) =>
      prev.map((img) =>
        img.id === imageId
          ? { ...img, rotation: (img.rotation || 0) - 90 }
          : img
      )
    );
  };

  const rotateImageRight = (imageId: string) => {
    setDraggableImages((prev) =>
      prev.map((img) =>
        img.id === imageId
          ? { ...img, rotation: (img.rotation || 0) + 90 }
          : img
      )
    );
  };

  const flipImageHorizontal = (imageId: string) => {
    setDraggableImages((prev) =>
      prev.map((img) =>
        img.id === imageId
          ? { ...img, flipHorizontal: !img.flipHorizontal }
          : img
      )
    );
  };

  const removeImage = (imageId: string) => {
    // Remove only the specific image instance (by ID), not all instances of that URL
    setDraggableImages((prev) => prev.filter((img) => img.id !== imageId));
    
    // Update selectedImageUrls to remove the URL if no more instances exist
    const remainingImages = draggableImages.filter((img) => img.id !== imageId);
    const urlToCheck = draggableImages.find((img) => img.id === imageId)?.url;
    if (urlToCheck && !remainingImages.some((img) => img.url === urlToCheck)) {
      setSelectedImageUrls((prev) => prev.filter((u) => u !== urlToCheck));
    }
    
    setSelectedImageId(null);
  };

  const bringToFront = (imageId: string) => {
    setDraggableImages((prev) => {
      const idx = prev.findIndex((img) => img.id === imageId);
      if (idx === -1) return prev;
      const next = prev.slice();
      const [item] = next.splice(idx, 1);
      next.push(item);
      return next;
    });
  };

  const sendToBack = (imageId: string) => {
    setDraggableImages((prev) => {
      const idx = prev.findIndex((img) => img.id === imageId);
      if (idx === -1) return prev;
      const next = prev.slice();
      const [item] = next.splice(idx, 1);
      next.unshift(item);
      return next;
    });
  };

  const downloadMoodboard = async () => {
    if (draggableImages.length === 0 && !backgroundImage) return;
    
    // Prepare payload with products and quantities
    const productCountMap = new Map<string, number>();
    draggableImages.forEach(img => {
      productCountMap.set(img.url, (productCountMap.get(img.url) || 0) + 1);
    });

    // Match image URLs to products and build payload
    const payload = {
      products: Array.from(productCountMap.entries()).map(([imageUrl, quantity]) => {
        const product = scraped_products.find(p => p.image === imageUrl);
        return {
          image: imageUrl,
          productName: product?.productName || '',
          itemCode: product?.itemCode || '',
          price: product?.price || '',
          quantity: quantity
        };
      })
    };

    // Send POST request to webhook via API proxy (fire and forget, don't block download)
    // Using API route to avoid CORS issues
    fetch('/api/moodboard-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => {
      // Silently fail - don't interrupt download if webhook fails
      console.error('Failed to send webhook:', err);
    });

    // Proceed with normal download immediately (don't wait for webhook)
    setExportToken((t) => t + 1);
  };

  const handleEditorExport = useCallback((png: string, jpeg: string) => {
    const link = document.createElement('a');
    link.download = 'moodboard.png';
    link.href = png;
    link.click();
  }, []);

  const handleGenerateMoodboard = async () => {
    if (selectedImageUrls.length === 0 || isGenerating) return;
    setIsGenerating(true);
    setGenerateMessage("");
    setGenerateError("");
    try {
      const magicWebhookUrl = process.env.NEXT_PUBLIC_MAGIC_WEBHOOK_URL;
      if (!magicWebhookUrl) {
        throw new Error('Missing NEXT_PUBLIC_MAGIC_WEBHOOK_URL');
      }
      const res = await fetch(magicWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: selectedImageUrls }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || 'Failed to generate moodboard');
      }
      setGenerateMessage('Moodboard request sent successfully.');
    } catch (e: any) {
      setGenerateError(e?.message || 'Unexpected error while generating moodboard');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveMoodboard = async () => {
    if (isSaving) return;
    
    // Get username from localStorage
    const username = localStorage.getItem('username');
    if (!username) {
      setSaveError('Username not found. Please log in again.');
      return;
    }

    // Prompt for name
    const name = prompt('Enter a name for this saved moodboard:');
    if (!name || name.trim() === '') {
      return; // User cancelled or entered empty name
    }

    setIsSaving(true);
    setSaveMessage("");
    setSaveError("");

    try {
      const webhookUrl = process.env.NEXT_PUBLIC_SAVE_MOODBOARD_WEBHOOK_URL;
      if (!webhookUrl) {
        throw new Error('NEXT_PUBLIC_SAVE_MOODBOARD_WEBHOOK_URL is not configured');
      }
      
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true' // Skip ngrok browser warning
        },
        body: JSON.stringify({
          username,
          name: name.trim(),
          draggableImages,
          backgroundImage,
          timestamp: new Date().toISOString(),
        }),
      });

      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || 'Failed to save moodboard');
      }

      setSaveMessage(`Moodboard "${name.trim()}" saved successfully!`);
      // Clear message after 3 seconds
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (e: any) {
      setSaveError(e?.message || 'Unexpected error while saving moodboard');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 sm:px-0 space-y-6">
          <h1 className="text-2xl font-semibold text-gray-900">Moodboard Builder</h1>
          <p className="text-gray-600">Select product images to add them to your moodboard slide.</p>

          <div className="flex flex-col gap-6">
        {/* Top: Moodboard Slide */}
        <div className="w-full">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm h-[50vh] sm:h-[55vh] md:h-[60vh] lg:h-[65vh] xl:h-[70vh] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Moodboard Slide</h2>
              <span className="text-xs text-gray-500">{selectedImageUrls.length} selected</span>
            </div>
            <div 
              ref={moodboardRef}
              className="flex-1 relative overflow-hidden bg-gray-100 flex items-center justify-center"
            >
              <div className="w-full h-full flex items-center justify-center">
                <CanvasEditor
                  width={canvasSize.width}
                  height={canvasSize.height}
                  background={backgroundImage ? { url: backgroundImage.url } : null}
                  items={draggableImages.map(d => ({ 
                    id: d.id, 
                    url: d.url, 
                    x: d.x, 
                    y: d.y, 
                    width: d.width, 
                    height: d.height,
                    rotation: d.rotation || 0,
                    flipHorizontal: d.flipHorizontal || false
                  }))}
                  onItemsChange={(next) => setDraggableImages(next.map(n => ({ 
                    id: n.id, 
                    url: n.url, 
                    x: n.x, 
                    y: n.y, 
                    width: n.width, 
                    height: n.height,
                    rotation: n.rotation,
                    flipHorizontal: n.flipHorizontal
                  })))}
                  maskMode={maskMode}
                  brushSize={brushSize}
                  polygonPoints={polygonPoints}
                  onPolygonPointsChange={setPolygonPoints}
                  onExport={handleEditorExport}
                  requestExportToken={exportToken}
                  onImageClick={setSelectedImageId}
                />
              </div>
            </div>
          </div>
          <div className="px-4 py-3 space-y-3">
            {/* Background Image Controls */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBackgroundUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  Upload Background
                </button>
                {backgroundImage && (
                  <button
                    onClick={removeBackgroundImage}
                    className="px-3 py-1.5 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700"
                  >
                    Remove Background
                  </button>
                )}
              </div>
              
              {/* Clear Moodboard Button */}
              {(draggableImages.length > 0 || backgroundImage) && (
                <div className="pt-2 border-t border-gray-200">
                  <button
                    onClick={clearMoodboard}
                    className="w-full px-3 py-2 text-sm font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100"
                  >
                    Clear Moodboard
                  </button>
                </div>
              )}
            </div>

            {/* Image Controls */}
            {selectedImageId && (
              <div className="bg-gray-50 p-3 rounded-md space-y-2">
                <div className="text-sm font-medium text-gray-900">Image Controls:</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => rotateImageLeft(selectedImageId)}
                    className="px-2 py-1 text-xs font-medium rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
                    title="Rotate Left"
                  >
                    ↶
                  </button>
                  <button
                    onClick={() => rotateImageRight(selectedImageId)}
                    className="px-2 py-1 text-xs font-medium rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
                    title="Rotate Right"
                  >
                    ↷
                  </button>
                  <button
                    onClick={() => flipImageHorizontal(selectedImageId)}
                    className="px-2 py-1 text-xs font-medium rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
                    title="Flip Horizontal"
                  >
                    ↔
                  </button>
                  <button
                    onClick={() => bringToFront(selectedImageId)}
                    className="px-2 py-1 text-xs font-medium rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
                    title="Bring to Front"
                  >
                    ⬆
                  </button>
                  <button
                    onClick={() => sendToBack(selectedImageId)}
                    className="px-2 py-1 text-xs font-medium rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
                    title="Send to Back"
                  >
                    ⬇
                  </button>
                  <button
                    onClick={() => removeImage(selectedImageId)}
                    className="px-2 py-1 text-xs font-medium rounded-md bg-red-200 text-red-700 hover:bg-red-300"
                    title="Remove Image"
                  >
                    ✕
                  </button>
                </div>
                <div className="text-xs text-gray-500">
                  Click on an image in the moodboard to select it and use these controls.
                </div>
              </div>
            )}

            {generateMessage && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{generateMessage}</div>
            )}
            {generateError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{generateError}</div>
            )}
            {saveMessage && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{saveMessage}</div>
            )}
            {saveError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{saveError}</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSaveMoodboard}
                disabled={isSaving || (draggableImages.length === 0 && !backgroundImage)}
                className="px-4 py-2 rounded-md text-white text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Moodboard'}
              </button>
              <button
                onClick={downloadMoodboard}
                disabled={draggableImages.length === 0 && !backgroundImage}
                className="flex-1 px-4 py-2 rounded-md text-white text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Download Moodboard
              </button>
            </div>
          </div>
        </div>

        {/* Bottom: Products listed */}
        <div className="w-full">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg sm:text-xl font-medium text-gray-900">Products</h2>
            {isLoadingProducts && <span className="text-sm text-gray-500">Loading...</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 max-h-[50vh] sm:max-h-[55vh] md:max-h-[60vh] overflow-y-auto pr-1">
            {products.map((product) => (
              <div key={product.id} className="bg-white rounded-lg shadow hover:shadow-md transition p-2 sm:p-3">
                <div className="aspect-[4/3] bg-gray-100 rounded-md overflow-hidden mb-2 sm:mb-3 relative">
                  <img 
                    src={getImageUrl(product.image)} 
                    alt={product.productName} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      console.error('Failed to load image:', product.image);
                      // Fallback to direct URL if proxy fails
                      if (e.currentTarget.src.includes('/api/proxy-image')) {
                        e.currentTarget.src = product.image;
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="text-xs sm:text-sm font-semibold text-gray-900 line-clamp-2">{product.productName}</div>
                    <div className="text-xs text-gray-500">{product.itemCode}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {getInstanceCount(product.image) > 0 && (
                      <span className="text-xs text-gray-500">×{getInstanceCount(product.image)}</span>
                    )}
                    <button
                      onClick={() => addToMoodboard(product.image)}
                      className="flex-1 sm:flex-initial px-2 sm:px-2.5 py-1.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      Add{getInstanceCount(product.image) > 0 ? ' More' : ''}
                    </button>
                    {getInstanceCount(product.image) > 0 && (
                      <button
                        onClick={() => removeFromMoodboard(product.image)}
                        className="flex-1 sm:flex-initial px-2 sm:px-2.5 py-1.5 text-xs font-medium rounded-md bg-red-50 text-red-700 hover:bg-red-100"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
          </div>
        </div>
      </main>
    </div>
  );
}


