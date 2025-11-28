"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { getCachedProducts, loadProductsOnce } from "../../lib/productsCache";
import dynamic from "next/dynamic";

const CanvasEditor = dynamic(() => import("../../components/CanvasEditor"), { ssr: false });

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
  zIndex: number;
}

export default function ProjectViewPage() {
  const params = useParams();
  const router = useRouter();
  const projectName = params?.projectName as string;
  
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem('username');
    }
    return false;
  });
  
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([]);
  const [draggableImages, setDraggableImages] = useState<DraggableImage[]>([]);
  const [scraped_products, setScrapedProducts] = useState<any[]>([]);
  const [backgroundImage, setBackgroundImage] = useState<BackgroundImage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string>("");
  const [saveError, setSaveError] = useState<string>("");
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moodboardRef = useRef<HTMLDivElement>(null);
  const hasFetchedScrapedProducts = useRef(false);
  const [canvasSize, setCanvasSize] = useState({ width: 960, height: 540 });
  const [exportToken, setExportToken] = useState<number>(0);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Check login state and redirect if not authenticated
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

    let timeoutId: NodeJS.Timeout;
    const rafId = requestAnimationFrame(() => {
      timeoutId = setTimeout(() => {
        updateCanvasSize();
        if (moodboardRef.current && typeof ResizeObserver !== 'undefined') {
          resizeObserverRef.current = new ResizeObserver(updateCanvasSize);
          resizeObserverRef.current.observe(moodboardRef.current);
        }
      }, 100); // Small delay to ensure container is fully rendered
    });

    window.addEventListener('resize', updateCanvasSize);

    return () => {
      cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('resize', updateCanvasSize);
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, [draggableImages.length]); // Recalculate when images load

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

  // Load project data from webhook
  useEffect(() => {
    if (!projectName) return;

    const loadProject = async () => {
      const username = localStorage.getItem('username');
      if (!username) {
        setError('Username not found. Please log in again.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const res = await fetch('/api/projects/open', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            username,
            project_name: projectName 
          }),
        });

        const response = await res.json();
        
        if (!res.ok || !response.success) {
          throw new Error(response.error || 'Failed to load project');
        }

        const data = response.data;
        const projectData = Array.isArray(data) ? data[0] : data;
        
        // Parse draggableImages if it's a JSON string
        let parsedDraggableImages: DraggableImage[] = [];
        if (projectData && projectData.draggableImages) {
          if (typeof projectData.draggableImages === 'string') {
            try {
              parsedDraggableImages = JSON.parse(projectData.draggableImages);
            } catch (e) {
              console.error('Error parsing draggableImages:', e);
            }
          } else if (Array.isArray(projectData.draggableImages)) {
            parsedDraggableImages = projectData.draggableImages;
          }
        }
        
        setDraggableImages(parsedDraggableImages);
        
        // Handle background image (support both backgroundImage and backgroundImages keys)
        const rawBackground =
          projectData?.backgroundImage ?? projectData?.backgroundImages;

        if (rawBackground) {
          if (typeof rawBackground === 'string') {
            try {
              const parsedBg = JSON.parse(rawBackground);
              setBackgroundImage(parsedBg);
            } catch (e) {
              console.warn('Background value is plain string, using default sizing.');
              setBackgroundImage({
                url: rawBackground,
                x: 0,
                y: 0,
                width: 960,
                height: 540,
                zIndex: -1,
              });
            }
          } else {
            setBackgroundImage(rawBackground);
          }
        }
        
        // Recalculate canvas size after data loads
        setTimeout(() => {
          if (moodboardRef.current) {
            const rect = moodboardRef.current.getBoundingClientRect();
            const aspectRatio = 16 / 9;
            let width = rect.width;
            let height = width / aspectRatio;
            if (height < rect.height) {
              height = rect.height;
              width = height * aspectRatio;
            }
            setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
          }
        }, 200);
      } catch (e: any) {
        console.error('Error loading project:', e);
        setError(e?.message || 'Failed to load project');
      } finally {
        setIsLoading(false);
      }
    };

    loadProject();
  }, [projectName]);

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
    setSelectedImageUrls((prev) => (prev.includes(imageUrl) ? prev : [...prev, imageUrl]));
    
    const newDraggableImage: DraggableImage = {
      id: `${imageUrl}-${Date.now()}`,
      url: imageUrl,
      x: Math.random() * 300 + 50,
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
        x: rect ? rect.width / 2 - 200 : 100,
        y: rect ? rect.height / 2 - 150 : 100,
        width: 400,
        height: 300,
        zIndex: -1,
      });
    };
    reader.readAsDataURL(file);
    
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
    setDraggableImages((prev) => prev.filter((img) => img.id !== imageId));
    
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
    
    const productCountMap = new Map<string, number>();
    draggableImages.forEach(img => {
      productCountMap.set(img.url, (productCountMap.get(img.url) || 0) + 1);
    });

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

    fetch('/api/moodboard-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(err => {
      console.error('Failed to send webhook:', err);
    });

    setExportToken((t) => t + 1);
  };

  const handleEditorExport = useCallback((png: string, jpeg: string) => {
    const link = document.createElement('a');
    link.download = `${projectName || 'moodboard'}.png`;
    link.href = png;
    link.click();
  }, [projectName]);

  const handleSaveMoodboard = async () => {
    if (isSaving) return;
    
    // Get username from localStorage
    const username = localStorage.getItem('username');
    if (!username) {
      setSaveError('Username not found. Please log in again.');
      return;
    }

    // Prompt for name (pre-fill with current project name)
    const name = prompt('Enter a name for this saved moodboard:', projectName);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.push('/projects')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 sm:px-0 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{projectName}</h1>
              <p className="text-gray-600 mt-1">Edit your saved moodboard</p>
            </div>
            <button
              onClick={() => router.push('/projects')}
              className="px-4 py-2 text-sm font-medium rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              Back to Projects
            </button>
          </div>

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
                      maskMode="none"
                      brushSize={24}
                      polygonPoints={[]}
                      onPolygonPointsChange={() => {}}
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
