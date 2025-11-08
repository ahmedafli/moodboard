import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, project_name } = body;

    // Validate input
    if (!username || !project_name) {
      return NextResponse.json(
        { success: false, error: 'Username and project_name are required' },
        { status: 400 }
      );
    }

    // Forward request to webhook (server-to-server, no CORS issues)
    const webhookUrl = process.env.WEBHOOK_OPEN_PROJECT_URL;
    if (!webhookUrl) {
      return NextResponse.json(
        { success: false, error: 'WEBHOOK_OPEN_PROJECT_URL is not configured' },
        { status: 500 }
      );
    }
    
    const requestBody = { username, project_name };
    console.log('Sending request to webhook:', webhookUrl);
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await webhookResponse.text();
    console.log('Webhook Response Status:', webhookResponse.status);
    console.log('Webhook Response Text:', responseText);
    
    let data;
    
    try {
      data = JSON.parse(responseText);
      console.log('Webhook Response Parsed:', JSON.stringify(data, null, 2));
    } catch {
      console.log('Failed to parse webhook response as JSON');
      // If response is not JSON, treat as error
      return NextResponse.json(
        { success: false, error: responseText || 'Failed to load project' },
        { status: webhookResponse.ok ? 500 : webhookResponse.status }
      );
    }

    // Check for n8n error responses (code 404 means webhook not registered)
    if (data.code === 404) {
      return NextResponse.json(
        { 
          success: false, 
          error: data.message || 'Webhook not found. Please check the webhook URL in n8n and update it in the code.',
          hint: data.hint 
        },
        { status: 404 }
      );
    }

    // Check if webhook returned an error object (even with 200 status)
    // Some webhooks return error objects with code 0 or error messages
    if (data.message && (
      data.message.includes('problem executing') || 
      data.message.includes('error') || 
      data.message.includes('failed')
    )) {
      return NextResponse.json(
        { success: false, error: data.message || 'Workflow execution failed' },
        { status: 500 }
      );
    }

    if (data.code !== undefined && data.code !== 0) {
      return NextResponse.json(
        { success: false, error: data.message || 'Workflow execution failed' },
        { status: 500 }
      );
    }

    if (!webhookResponse.ok) {
      return NextResponse.json(
        { success: false, error: data.message || responseText || 'Failed to load project' },
        { status: webhookResponse.status }
      );
    }

    // Handle successful response - data can be an array or object
    // If it's an array, that's the expected format from n8n
    return NextResponse.json(
      { success: true, data },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error opening project:', error);
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}

