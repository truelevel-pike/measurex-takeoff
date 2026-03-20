/**
 * AI-powered sheet name extraction for image-only PDFs.
 * Falls back to OpenAI vision (gpt-4o) when text-based extraction returns null.
 */

import { getOpenAIKey } from '@/lib/openai-guard';

export async function aiSheetNamer(imageBase64: string): Promise<string | null> {
  const apiKey = getOpenAIKey();
  if (!apiKey) return null;

  // BUG-A5-5-038: skip AI naming if image is too large (> 500KB base64)
  if (imageBase64.length > 500_000) return null;

  const imageUrl = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are analyzing a construction blueprint page. Extract the sheet name/number from the title block. ' +
              'Title blocks are typically in the bottom-right corner and contain a sheet number (e.g. A1.1, S2.0, M1.01, E3.1) ' +
              'and a sheet title (e.g. FLOOR PLAN, ELEVATIONS, DETAILS). ' +
              'Return ONLY the sheet identifier in the format "NUMBER TITLE" (e.g. "A1.1 FLOOR PLAN"). ' +
              'If you cannot find a title block or sheet name, return exactly the word "null".',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is the sheet name/number on this blueprint page?' },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
            ],
          },
        ],
        max_tokens: 100,
        temperature: 0.1,
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim();

    if (!content || content.toLowerCase() === 'null') return null;

    // Clean up: remove quotes, extra whitespace
    const cleaned = content.replace(/^["']|["']$/g, '').trim();
    return cleaned || null;
  } catch {
    return null;
  }
}
