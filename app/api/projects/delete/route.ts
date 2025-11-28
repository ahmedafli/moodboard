import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const webhookUrl = process.env.N8N_DELETE_MOODBOARD;

  if (!webhookUrl) {
    console.error('[projects/delete] Missing env N8N_DELETE_MOODBOARD');
    return NextResponse.json(
      { success: false, error: 'Server misconfiguration: N8N_DELETE_MOODBOARD is missing' },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let payload: any = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // keep plain text
    }

    if (!res.ok || payload?.success === false) {
      const errorMessage = payload?.error || text || 'Delete webhook failed';
      console.error('[projects/delete] Webhook error:', errorMessage);
      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: payload });
  } catch (error) {
    console.error('[projects/delete] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Unexpected server error while deleting project' },
      { status: 500 }
    );
  }
}


