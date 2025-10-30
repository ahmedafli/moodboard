let cachedProducts: any[] | null = null;
let inflight: Promise<any[]> | null = null;

export function getCachedProducts(): any[] | null {
  return cachedProducts;
}

export async function loadProductsOnce(): Promise<any[]> {
  if (cachedProducts) return cachedProducts;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.products)) {
        const withIds = data.products.map((p: any, i: number) => ({
          id: Date.now() + i,
          image: p.image,
          productName: p.productName,
          itemCode: p.itemCode,
          price: p.price,
        }));
        cachedProducts = withIds;
        return withIds;
      }
      cachedProducts = [];
      return [];
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}


