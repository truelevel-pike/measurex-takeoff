import { NextResponse } from 'next/server';
import spec from '../openapi-spec.json';

export async function GET() {
  const specJson = JSON.stringify(spec);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MeasureX Takeoff API</title>
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="redoc-container"></div>
  <script src="https://cdn.jsdelivr.net/npm/redoc@latest/bundles/redoc.standalone.js"></script>
  <script>
    Redoc.init(${specJson}, {
      theme: {
        colors: {
          primary: { main: '#3b82f6' },
          text: { primary: '#e2e8f0' },
          http: {
            get: '#22c55e',
            post: '#3b82f6',
            put: '#f59e0b',
            delete: '#ef4444',
            patch: '#a855f7'
          }
        },
        typography: {
          fontSize: '15px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          headings: { fontFamily: 'system-ui, -apple-system, sans-serif' }
        },
        sidebar: {
          backgroundColor: '#1e1e2e',
          textColor: '#cdd6f4'
        },
        rightPanel: {
          backgroundColor: '#181825'
        },
        schema: {
          nestedBackground: '#1e1e2e'
        }
      },
      scrollYOffset: 0,
      hideDownloadButton: false,
      nativeScrollbars: true
    }, document.getElementById('redoc-container'));
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
