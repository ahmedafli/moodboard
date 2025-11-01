import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const productName = formData.get('productName') as string;
    const price = formData.get('price') as string;
    const codeItem = formData.get('codeItem') as string;
    const imageFile = formData.get('image') as File;

    // Validate required fields
    if (!productName || !price || !imageFile) {
      return NextResponse.json(
        { success: false, error: 'Product name, price, and image are required' },
        { status: 400 }
      );
    }

    // Convert image file to base64 data URL
    const imageBuffer = await imageFile.arrayBuffer();
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');
    const imageDataUrl = `data:${imageFile.type};base64,${imageBase64}`;

    // Prepare the JSON payload for the webhook
    const webhookPayload = {
      productName: productName,
      imageUrl: imageDataUrl,
      codeItem: codeItem || null,
      price: price
    };

    // Send request to webhook URL with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000); // 50 second timeout

    try {
      const webhookUrl = process.env.N8N_MANUAL_SUBMIT_WEBHOOK_URL;
<<<<<<< HEAD
      if (!webhookUrl) {
        return NextResponse.json(
          { success: false, error: 'Server misconfiguration: N8N_MANUAL_SUBMIT_WEBHOOK_URL is missing' },
          { status: 500 }
        );
      }
=======
>>>>>>> cea1f81a25dd4622fdd00cc64ed676747864172d
      
      const webhookResponse = await fetch(
        webhookUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(webhookPayload),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!webhookResponse.ok) {
        console.error('Webhook error:', webhookResponse.status, webhookResponse.statusText);
        return NextResponse.json(
          { success: false, error: 'Failed to submit product to webhook' },
          { status: 500 }
        );
      }

      const responseData = await webhookResponse.json();
      console.log('Webhook response:', responseData);

      // Return success response with product details
      // Use the data URL we created for the image
      return NextResponse.json(
        {
          success: true,
          product: {
            image: imageDataUrl,
            productName: productName,
            itemCode: codeItem || '',
            price: price,
          },
        },
        { status: 200 }
      );
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json(
          { success: false, error: 'Request timeout - webhook took too long to respond' },
          { status: 500 }
        );
      }
      
      throw fetchError;
    }
  } catch (error) {
    console.error('Error processing manual submission:', error);
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}

