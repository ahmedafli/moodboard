import { NextResponse } from 'next/server';

export async function GET() {
  const webhookUrl = process.env.N8N_PRODUCTS_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ success: false, error: 'Server misconfiguration: N8N_PRODUCTS_WEBHOOK_URL is missing' }, { status: 500 });
  }

  try {
    const res = await fetch(webhookUrl, { headers: { 'Content-Type': 'application/json' } });
    const text = await res.text();
    
    if (!text) {
      return NextResponse.json({ success: false, error: 'Empty response from webhook' }, { status: 500 });
    }

    const rawData = JSON.parse(text);

    // 🔹 Normalize keys (handle both "PRODUCT DESCRIPTION" and "PRIDUCT DESCRIPTION" for backwards compatibility)
    const products = rawData.map((p: any) => ({
      image: p.IMAGE,
      productName: p['PRODUCT DESCRIPTION'] || p['PRIDUCT DESCRIPTION'],
      itemCode: p['CODE'],
      price: p.PRICE,
    }));

    console.log('[products API] Normalized products:', products);

    return NextResponse.json({ success: true, products }); // 👈 changed key from rawData → products
  } catch (err) {
    console.error('[products API] Error fetching webhook:', err);
    return NextResponse.json(
      { success: false, error: 'Server error fetching webhook' },
      { status: 500 }
    );
  }
}
