import { NextRequest, NextResponse } from 'next/server';

// Proxy route to call external scraped products webhook server-side (avoids CORS in the browser)
export async function GET(_req: NextRequest) {
  const webhookUrl = process.env.N8N_Return_All_Scrapped_Products;

  if (!webhookUrl) {
    console.error('[scraped-products API] Missing env N8N_Return_All_Scrapped_Products');
    return NextResponse.json(
      { success: false, error: 'Server misconfiguration: N8N_Return_All_Scrapped_Products is missing' },
      { status: 200 }
    );
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
    });

    const text = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    // Normalize: webhook should always effectively return an array (possibly empty)
    const dataArray = Array.isArray(parsed) ? parsed : [];

    // Always return 200 to avoid frontend seeing a hard 500; treat any array (even empty) as success
    return NextResponse.json({
      success: true,
      status: res.status,
      statusText: res.statusText,
      data: dataArray,
    });
  } catch (error) {
    console.error('[scraped-products API] Error calling webhook:', error);
    return NextResponse.json(
      { success: false, error: 'Server error calling scraped products webhook' },
      { status: 200 }
    );
  }
}


