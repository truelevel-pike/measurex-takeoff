import { NextResponse } from 'next/server';

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MeasureX Takeoff API — v1.0.0</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0f0f1a; font-family: system-ui, -apple-system, sans-serif; }
    .topbar-wrapper { display: none !important; }
    .swagger-ui .topbar { background: #1e1e2e !important; padding: 12px 24px; }
    /* Dark-theme overrides */
    .swagger-ui { color: #cdd6f4; }
    .swagger-ui .info .title { color: #e2e8f0; }
    .swagger-ui .info p, .swagger-ui .info li { color: #a6adc8; }
    .swagger-ui .scheme-container { background: #1e1e2e; box-shadow: none; }
    .swagger-ui .opblock-tag { color: #cdd6f4 !important; border-bottom-color: #313244 !important; }
    .swagger-ui .opblock { border-color: #313244; background: #181825; }
    .swagger-ui .opblock .opblock-summary { border-color: #313244; }
    .swagger-ui .opblock .opblock-summary-description { color: #a6adc8; }
    .swagger-ui .opblock .opblock-section-header { background: #1e1e2e; }
    .swagger-ui .opblock .opblock-section-header h4 { color: #cdd6f4; }
    .swagger-ui .opblock-body pre { background: #11111b !important; color: #cdd6f4; }
    .swagger-ui .opblock.opblock-get { border-color: #22c55e44; background: #22c55e08; }
    .swagger-ui .opblock.opblock-get .opblock-summary { border-color: #22c55e44; }
    .swagger-ui .opblock.opblock-post { border-color: #3b82f644; background: #3b82f608; }
    .swagger-ui .opblock.opblock-post .opblock-summary { border-color: #3b82f644; }
    .swagger-ui .opblock.opblock-put { border-color: #f59e0b44; background: #f59e0b08; }
    .swagger-ui .opblock.opblock-put .opblock-summary { border-color: #f59e0b44; }
    .swagger-ui .opblock.opblock-delete { border-color: #ef444444; background: #ef444408; }
    .swagger-ui .opblock.opblock-delete .opblock-summary { border-color: #ef444444; }
    .swagger-ui .model-box { background: #1e1e2e; }
    .swagger-ui .model { color: #cdd6f4; }
    .swagger-ui .model-title { color: #cdd6f4; }
    .swagger-ui table thead tr th { color: #a6adc8; border-bottom-color: #313244; }
    .swagger-ui table tbody tr td { color: #cdd6f4; border-bottom-color: #313244; }
    .swagger-ui .parameter__name { color: #89b4fa; }
    .swagger-ui .parameter__type { color: #a6adc8; }
    .swagger-ui .response-col_status { color: #a6e3a1; }
    .swagger-ui .response-col_description { color: #cdd6f4; }
    .swagger-ui .btn { color: #cdd6f4; border-color: #45475a; }
    .swagger-ui .btn:hover { background: #313244; }
    .swagger-ui select { background: #1e1e2e; color: #cdd6f4; border-color: #45475a; }
    .swagger-ui input[type=text] { background: #1e1e2e; color: #cdd6f4; border-color: #45475a; }
    .swagger-ui textarea { background: #1e1e2e; color: #cdd6f4; border-color: #45475a; }
    .swagger-ui .markdown p, .swagger-ui .markdown li { color: #a6adc8; }
    .swagger-ui .renderedMarkdown p { color: #a6adc8; }
    .swagger-ui .model-container { background: #181825; }
    .swagger-ui section.models { border-color: #313244; }
    .swagger-ui section.models h4 { color: #cdd6f4; border-bottom-color: #313244; }
    /* Header bar */
    .mx-header { background: #1e1e2e; border-bottom: 1px solid #313244; padding: 16px 32px; display: flex; align-items: center; gap: 12px; }
    .mx-header .logo { font-size: 20px; font-weight: 700; color: #e2e8f0; letter-spacing: -0.5px; }
    .mx-header .badge { background: #3b82f6; color: white; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 9999px; }
    .mx-header .subtitle { color: #6c7086; font-size: 13px; margin-left: auto; }
  </style>
</head>
<body>
  <div class="mx-header">
    <div class="logo">MeasureX</div>
    <span class="badge">v1.0.0</span>
    <span class="subtitle">Construction Takeoff API Documentation</span>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 2,
      docExpansion: 'list',
      filter: true,
      showExtensions: true,
      tryItOutEnabled: true,
    });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
