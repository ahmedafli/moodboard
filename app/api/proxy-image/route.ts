import { NextRequest, NextResponse } from 'next/server';

// Helper function to convert Google Drive URLs to a format that returns actual images
function convertGoogleDriveUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    
    // Check if it's a Google Drive URL
    if (urlObj.hostname === 'drive.google.com') {
      // Extract file ID from various Google Drive URL formats
      let fileId: string | null = null;
      
      // Format: https://drive.google.com/uc?export=view&id=FILE_ID
      if (urlObj.pathname === '/uc' && urlObj.searchParams.has('id')) {
        fileId = urlObj.searchParams.get('id');
      }
      // Format: https://drive.google.com/file/d/FILE_ID/view
      else if (urlObj.pathname.startsWith('/file/d/')) {
        const match = urlObj.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (match) {
          fileId = match[1];
        }
      }
      // Format: https://drive.google.com/open?id=FILE_ID
      else if (urlObj.searchParams.has('id')) {
        fileId = urlObj.searchParams.get('id');
      }
      
      if (fileId) {
        // Use the thumbnail API which is more reliable for images
        // This works for publicly shared files and returns actual image data
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w2000`;
      }
    }
    
    return url;
  } catch (error) {
    // If URL parsing fails, return original URL
    return url;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
  }

  try {
    // Validate URL to prevent SSRF attacks
    const url = new URL(imageUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 });
    }

    // Convert Google Drive URLs to a format that actually returns images
    const convertedUrl = convertGoogleDriveUrl(imageUrl);

    // Fetch the image with proper headers and redirect handling
    const response = await fetch(convertedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://drive.google.com/',
      },
      redirect: 'follow', // Follow redirects (Google Drive may redirect)
    });

    if (!response.ok) {
      // If thumbnail format fails for Google Drive, try the download format as fallback
      if (convertedUrl.includes('drive.google.com') && convertedUrl.includes('thumbnail')) {
        const fileIdMatch = convertedUrl.match(/id=([a-zA-Z0-9_-]+)/);
        if (fileIdMatch) {
          const fileId = fileIdMatch[1];
          const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
          const downloadResponse = await fetch(downloadUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            redirect: 'follow',
          });
          
          if (downloadResponse.ok) {
            const imageBuffer = await downloadResponse.arrayBuffer();
            const contentType = downloadResponse.headers.get('content-type') || 'image/jpeg';
            
            return new NextResponse(imageBuffer, {
              headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'Access-Control-Allow-Headers': 'Content-Type',
              },
            });
          }
        }
      }
      
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: response.status });
    }

    // Check if the response is actually an image (Google Drive might return HTML for private files)
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      // If we get HTML or other non-image content, it might be a private file
      return NextResponse.json({ 
        error: 'Image not accessible. Make sure the Google Drive file is publicly shared.' 
      }, { status: 403 });
    }

    const imageBuffer = await response.arrayBuffer();

    // Return the image with proper headers
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('Error proxying image:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
