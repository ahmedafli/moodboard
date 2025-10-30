import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, url } = body;

    // Validate input
    if (!username || !url) {
      return NextResponse.json(
        { success: false, error: 'Username and URL are required' },
        { status: 400 }
      );
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid URL' },
        { status: 400 }
      );
    }

    // Send request to n8n webhook with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000); // 25 second timeout

    try {
      const submitWebhookUrl = process.env.N8N_SUBMIT_WEBHOOK_URL;
      if (!submitWebhookUrl) {
        return NextResponse.json(
          { success: false, error: 'Server misconfiguration: N8N_SUBMIT_WEBHOOK_URL is missing' },
          { status: 500 }
        );
      }

      const webhookResponse = await fetch(
        submitWebhookUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username, url }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!webhookResponse.ok) {
        return NextResponse.json(
          { success: false, error: 'Failed to fetch product info from workflow' },
          { status: 500 }
        );
      }

      const productData = await webhookResponse.json();
      // Validate that we received the expected product structure
      if (
        !productData ||
        !productData.productName ||
        !productData.imageUrl ||
        !productData.codeItem ||
        !productData.price 
      ) {
        console.error('Invalid product data received:', productData);
        return NextResponse.json(
          { success: false, error: 'Invalid product data received from workflow' },
          { status: 500 }
        );
      }

      // Return success response with product details
      return NextResponse.json(
        {
          success: true,
          product: {
            image: productData.imageUrl,       // 👈 fix
            productName: productData.productName, // 👈 fix
            itemCode: productData.codeItem,    // 👈 fix typo
            price: productData.price,
          },
        },
        { status: 200 }
      );
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json(
          { success: false, error: 'Request timeout - workflow took too long to respond' },
          { status: 500 }
        );
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error('Error processing submission:', error);
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
