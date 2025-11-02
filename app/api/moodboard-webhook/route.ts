import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const webhookUrl = process.env.NEXT_PUBLIC_N8N_QTY_PRICE_TOTAL_download;
    
    if (!webhookUrl) {
      console.warn('Webhook URL not configured: NEXT_PUBLIC_N8N_QTY_PRICE_TOTAL_download is missing');
      // Still return success to not block the download
      return NextResponse.json(
        { success: false, error: 'Webhook URL not configured' },
        { status: 200 }
      );
    }
    
    // Forward the request to the webhook (server-to-server, no CORS issues)
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // Return success regardless of webhook response (fire and forget)
    return NextResponse.json(
      { success: true },
      { status: 200 }
    );
  } catch (error) {
    // Silently fail - don't interrupt user experience
    console.error('Moodboard webhook error:', error);
    return NextResponse.json(
      { success: false },
      { status: 200 } // Still return 200 to not block the download
    );
  }
}

