import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    // Validate input
    if (!username || !password) {
      return NextResponse.json(
        { success: false, error: 'Username and password are required' },
        { status: 400 }
      );
    }

    // Send request to n8n webhook
    const loginWebhookUrl = process.env.N8N_LOGIN_WEBHOOK_URL;
    if (!loginWebhookUrl) {
      return NextResponse.json(
        { success: false, error: 'Server misconfiguration: N8N_LOGIN_WEBHOOK_URL is missing' },
        { status: 500 }
      );
    }

    const webhookResponse = await fetch(
      loginWebhookUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      }
    );

    if (!webhookResponse.ok) {
      return NextResponse.json(
        { success: false, error: 'problem with n8n webhook' },
        { status: 401 }
      );
    }

    const webhookData = await webhookResponse.json();

    // Check if webhook response contains success message
    if (webhookData.message === 'User verified successfully') {
      return NextResponse.json(
        { success: true },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid username or password' },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
