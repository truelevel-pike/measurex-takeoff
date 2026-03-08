import { z } from 'zod';
import type { ScaleCalibration } from './types';

export const DetectedElementSchema = z.object({
  name: z.string(),
  type: z.enum(['area', 'linear', 'count']),
  classification: z.string().optional(),
  points: z.array(z.object({ x: z.number(), y: z.number() })).min(1),
  color: z.string().optional(),
});
export const DetectedElementsSchema = z.array(DetectedElementSchema);
export type DetectedElement = z.infer<typeof DetectedElementSchema>;

function downscaleCanvasToMax(canvas: HTMLCanvasElement, maxEdge = 2048): string {
  const { width, height } = canvas;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale === 1) return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
  const off = document.createElement('canvas');
  off.width = Math.round(width * scale);
  off.height = Math.round(height * scale);
  const ctx = off.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, off.width, off.height);
  return off.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}

export function capturePageScreenshot(canvas: HTMLCanvasElement): string {
  return downscaleCanvasToMax(canvas, 2048);
}

async function callOpenAI(imageBase64: string, scale: ScaleCalibration | null, pageWidth: number, pageHeight: number) {
  const res = await fetch('/api/ai-takeoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, scale: scale ? { pixelsPerUnit: scale.pixelsPerUnit, unit: scale.unit } : null, pageWidth, pageHeight }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `OpenAI route returned ${res.status}`);
  }
  const data = await res.json();
  return data.elements;
}

async function callGemini(imageBase64: string, scale: ScaleCalibration | null, pageWidth: number, pageHeight: number) {
  // Placeholder: same API route for now; backend can switch provider
  return callOpenAI(imageBase64, scale, pageWidth, pageHeight);
}

export async function triggerAITakeoff(
  imageBase64: string,
  scale: ScaleCalibration | null,
  pageWidth: number,
  pageHeight: number
): Promise<DetectedElement[]> {
  // Retry policy: 2 attempts, 3s backoff; then fallback to Gemini once
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const elements = await callOpenAI(imageBase64, scale, pageWidth, pageHeight);
      const parsed = DetectedElementsSchema.parse(elements);
      return parsed;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  try {
    const elements = await callGemini(imageBase64, scale, pageWidth, pageHeight);
    const parsed = DetectedElementsSchema.parse(elements);
    return parsed;
  } catch (e) {
    throw new Error((e as Error).message || (lastErr as Error)?.message || 'AI takeoff failed');
  }
}
