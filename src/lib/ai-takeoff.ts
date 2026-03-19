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

const AiTakeoffResponseSchema = z.object({
  results: DetectedElementsSchema,
});

function toPngDataUrl(imageBase64: string): string {
  return imageBase64.startsWith('data:image/') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
}

function downscaleCanvasToMax(canvas: HTMLCanvasElement, maxEdge = 2048): string {
  const { width, height } = canvas;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale === 1) return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');

  const off = document.createElement('canvas');
  off.width = Math.round(width * scale);
  off.height = Math.round(height * scale);
  const ctx = off.getContext('2d');
  if (!ctx) {
    throw new Error('Could not create 2D canvas context for downscaling');
  }
  ctx.drawImage(canvas, 0, 0, off.width, off.height);
  return off.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
}

export function capturePageScreenshot(canvas: HTMLCanvasElement): string {
  return downscaleCanvasToMax(canvas, 2048);
}

async function callOpenAIVision(
  imageBase64: string,
  scale: ScaleCalibration | null,
  pageWidth: number,
  pageHeight: number,
  projectId?: string,
  pageNumber?: number,
): Promise<DetectedElement[]> {
  performance.mark('ai-takeoff-start');
  const res = await fetch('/api/ai-takeoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: toPngDataUrl(imageBase64),
      scale: scale ? { pixelsPerUnit: scale.pixelsPerUnit, unit: scale.unit } : null,
      pageWidth,
      pageHeight,
      projectId,
      pageNumber,
    }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = payload && typeof payload === 'object' && 'error' in payload && typeof (payload as { error?: unknown }).error === 'string'
      ? (payload as { error: string }).error
      : `OpenAI route returned ${res.status}`;
    throw new Error(msg);
  }

  const parsed = AiTakeoffResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(`Invalid AI takeoff response: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }

  performance.mark('ai-takeoff-end');
  const aiMeasure = performance.measure('ai-takeoff', 'ai-takeoff-start', 'ai-takeoff-end');
  if (typeof window !== 'undefined') {
    if (!window.__perfMarks) window.__perfMarks = { pdfRender: null, aiTakeoff: null, polygonDraw: null };
    window.__perfMarks.aiTakeoff = aiMeasure.duration;
  }

  return parsed.data.results;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function triggerAITakeoff(
  imageBase64: string,
  scale: ScaleCalibration | null,
  pageWidth: number,
  pageHeight: number,
  projectId?: string,
  pageNumber?: number,
): Promise<DetectedElement[]> {
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await callOpenAIVision(imageBase64, scale, pageWidth, pageHeight, projectId, pageNumber);
    } catch (err) {
      lastErr = err;
      if (attempt < 2) {
        await delay(3000);
      }
    }
  }

  throw new Error((lastErr as Error)?.message || 'AI takeoff failed');
}
