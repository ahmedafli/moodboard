'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getCachedProducts, loadProductsOnce } from '../lib/productsCache';

interface Product {
  id: number;
  image: string;
  productName: string;
  itemCode: string;
  price: string;
  submittedUrl?: string;
  timestamp?: string;
}

export default function HomePage() {
  const [username, setUsername] = useState('');
  const [url, setUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [removingBackground, setRemovingBackground] = useState<Set<number>>(new Set());
  const router = useRouter();

  // Manual product submission state
  const [manualProductName, setManualProductName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualCodeItem, setManualCodeItem] = useState('');
  const [manualImage, setManualImage] = useState<File | null>(null);
  const [manualImagePreview, setManualImagePreview] = useState<string>('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [manualSubmitMessage, setManualSubmitMessage] = useState('');
  const [manualSubmitError, setManualSubmitError] = useState('');

  // Helper function to get proxied image URL for Google Drive images
  const getImageUrl = (imageUrl: string) => {
    // Check if it's a Google Drive URL
    if (imageUrl.includes('drive.google.com')) {
      return `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    }
    return imageUrl;
  };

  // 🔹 Check login state
  useEffect(() => {
    const savedUsername = localStorage.getItem('username');
    if (!savedUsername) {
      router.push('/login');
    } else {
      setUsername(savedUsername);
    }
  }, [router]);

  // 🔹 Load products from cache or API once per session
  useEffect(() => {
    const init = async () => {
      const cached = getCachedProducts();
      if (cached) {
        setProducts(cached.map((p: any) => ({ ...p, timestamp: new Date().toISOString() })));
        return;
      }
      setIsLoadingProducts(true);
      try {
        const loaded = await loadProductsOnce();
        setProducts(loaded.map((p: any) => ({ ...p, timestamp: new Date().toISOString() })));
      } catch (err) {
        console.error('Error loading products:', err);
      } finally {
        setIsLoadingProducts(false);
      }
    };
    init();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('username');
    router.push('/login');
  };

  const handleRemoveBackground = async (product: Product) => {
    // Add product ID to loading set
    setRemovingBackground(prev => new Set(prev).add(product.id));

    try {
      const removeBgWebhookUrl = process.env.NEXT_PUBLIC_REMOVEBG_WEBHOOK_URL;
      if (!removeBgWebhookUrl) {
        throw new Error('Missing NEXT_PUBLIC_REMOVEBG_WEBHOOK_URL');
      }
      const response = await fetch(removeBgWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(product),
      });

      if (!response.ok) {
        throw new Error('Failed to remove background');
      }

      const responseData = await response.json();
      console.log('Response data:', responseData);
      // Normalize the response to match our Product interface
      const updatedProduct = {
        id: product.id,
        image: responseData.imageUrl || product.image,
        productName: responseData.productName || product.productName,
        itemCode: responseData.codeItem || product.itemCode,
        price: responseData.price || product.price,
        submittedUrl: product.submittedUrl,
        timestamp: product.timestamp,
      };

      console.log('Updated product:', updatedProduct);

      // Update the product in the products array
      setProducts(prev =>
        prev.map(p => p.id === product.id ? updatedProduct : p)
      );
    } catch (err) {
      console.error('Error removing background:', err);
      alert('Failed to remove background. Please try again.');
    } finally {
      // Remove product ID from loading set
      setRemovingBackground(prev => {
        const newSet = new Set(prev);
        newSet.delete(product.id);
        return newSet;
      });
    }
  };

  const handleSubmitUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage('');
    setSubmitError('');

    try {
      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, url }),
      });
      const data = await response.json();
      console.log('Submit response:', data);

      if (response.ok && data.success && data.product) {
        setSubmitMessage('✅ Product information retrieved successfully!');
        const newProduct: Product = {
          ...data.product,
          id: Date.now(),
          submittedUrl: url,
          timestamp: new Date().toISOString(),
        };
        setProducts((prev) => [newProduct, ...prev]);
        setUrl('');
      } else {
        setSubmitError(data.error || 'Failed to retrieve product information');
      }
    } catch (err) {
      console.error(err);
      setSubmitError('An error occurred while submitting the URL');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setManualSubmitError('Please select an image file');
        return;
      }
      setManualImage(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setManualImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setManualSubmitError('');
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingManual(true);
    setManualSubmitMessage('');
    setManualSubmitError('');

    if (!manualImage) {
      setManualSubmitError('Please select an image');
      setIsSubmittingManual(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('productName', manualProductName);
      formData.append('price', manualPrice);
      formData.append('codeItem', manualCodeItem || '');
      formData.append('image', manualImage);

      const response = await fetch('/api/submit-manual', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      console.log('Manual submit response:', data);

      if (response.ok && data.success && data.product) {
        setManualSubmitMessage('✅ Product submitted successfully!');
        const newProduct: Product = {
          ...data.product,
          id: Date.now(),
          timestamp: new Date().toISOString(),
        };
        setProducts((prev) => [newProduct, ...prev]);
        // Reset form
        setManualProductName('');
        setManualPrice('');
        setManualCodeItem('');
        setManualImage(null);
        setManualImagePreview('');
      } else {
        setManualSubmitError(data.error || 'Failed to submit product');
      }
    } catch (err) {
      console.error(err);
      setManualSubmitError('An error occurred while submitting the product');
    } finally {
      setIsSubmittingManual(false);
    }
  };

  if (!username) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Welcome Home</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">Hello, {username}!</span>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0 space-y-8">
          {/* Welcome Section */}
          <div className="border-4 border-dashed border-gray-200 rounded-lg p-8 text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Welcome to your dashboard!</h2>
            <p className="text-lg text-gray-600 mb-8">
              You have successfully logged in as <strong>{username}</strong>
            </p>
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <p className="text-green-800">
                ✅ Authentication successful! Your username is saved in localStorage.
              </p>
            </div>
          </div>

          {/* URL Submission Form */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Submit a URL</h3>
            <form onSubmit={handleSubmitUrl} className="space-y-4">
              <div>
                <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
                  Website URL
                </label>
                <input
                  id="url"
                  name="url"
                  type="url"
                  required
                  placeholder="https://example.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>

              {submitMessage && (
                <div className="rounded-md bg-green-50 p-4 text-green-700 text-sm">{submitMessage}</div>
              )}
              {submitError && (
                <div className="rounded-md bg-red-50 p-4 text-red-700 text-sm">{submitError}</div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Analyzing Product...' : 'Submit URL'}
                </button>
              </div>
            </form>
          </div>

          {/* Manual Product Submission Form */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Add Product Manually</h3>
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div>
                <label htmlFor="productName" className="block text-sm font-medium text-gray-700 mb-2">
                  Product Name *
                </label>
                <input
                  id="productName"
                  name="productName"
                  type="text"
                  required
                  placeholder="Enter product name"
                  value={manualProductName}
                  onChange={(e) => setManualProductName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>

              <div>
                <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-2">
                  Price *
                </label>
                <input
                  id="price"
                  name="price"
                  type="text"
                  required
                  placeholder="Enter price"
                  value={manualPrice}
                  onChange={(e) => setManualPrice(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>

              <div>
                <label htmlFor="codeItem" className="block text-sm font-medium text-gray-700 mb-2">
                  Code Item (Optional)
                </label>
                <input
                  id="codeItem"
                  name="codeItem"
                  type="text"
                  placeholder="Enter code item"
                  value={manualCodeItem}
                  onChange={(e) => setManualCodeItem(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>

              <div>
                <label htmlFor="image" className="block text-sm font-medium text-gray-700 mb-2">
                  Product Image (JPEG or PNG) *
                </label>
                <input
                  id="image"
                  name="image"
                  type="file"
                  accept="image/jpeg,image/png"
                  required
                  onChange={handleImageChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>

              {manualImagePreview && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Preview:</p>
                  <div className="aspect-[4/3] bg-gray-100 rounded-md overflow-hidden max-w-xs">
                    <img
                      src={manualImagePreview}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}

              {manualSubmitMessage && (
                <div className="rounded-md bg-green-50 p-4 text-green-700 text-sm">{manualSubmitMessage}</div>
              )}
              {manualSubmitError && (
                <div className="rounded-md bg-red-50 p-4 text-red-700 text-sm">{manualSubmitError}</div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={isSubmittingManual}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingManual ? 'Submitting Product...' : 'Submit Product'}
                </button>
              </div>
            </form>
          </div>

          {/* Products Section */}
          {isLoadingProducts && <div className="mt-6 text-sm text-gray-500">Loading products...</div>}
          {products.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6 mt-6">
              <h4 className="text-lg font-medium text-gray-900 mb-4">Products</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map((product) => {
                  const isRemoving = removingBackground.has(product.id);
                  return (
                    <div key={product.id} className="bg-white rounded-lg shadow hover:shadow-md transition p-4 flex flex-col">
                      <div className="aspect-[4/3] bg-gray-100 rounded-md overflow-hidden mb-4 relative">
                        <img
                          key={`img-${product.id}-${product.image}`}
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
                        {isRemoving && (
                          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                          </div>
                        )}
                      </div>
                      <h5 className="text-lg font-semibold text-gray-900">{product.productName}</h5>
                      <p className="mt-1 text-sm text-gray-600">{product.itemCode}</p>
                      <p className="mt-3 text-base font-bold text-green-700">{product.price}</p>
                      <button
                        onClick={() => handleRemoveBackground(product)}
                        disabled={isRemoving}
                        className="mt-4 w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isRemoving ? 'Removing Background...' : 'Remove Background'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
