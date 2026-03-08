import type { ScaleCalibration } from './types';

export interface DetectedScaleResult {
  scale: ScaleCalibration;
  confidence: number;
  matchIndex: number;
}

const PDF_DPI = 72; // PDF points per inch

// Try to parse imperial scales like 1/4" = 1'-0" with optional spaces/dashes
function parseImperial(text: string): DetectedScaleResult | null {
  const regex = /(\d+(?:\/\d+)?)\s*["”]?\s*=\s*(\d+)\s*['’]\s*(?:[-–—]?\s*0\s*["”]?)?/i;
  const m = regex.exec(text);
  if (!m) return null;
  const scaleStr = m[1];
  const feet = parseFloat(m[2]);
  if (!feet || feet <= 0) return null;
  const inches = scaleStr.includes('/')
    ? (() => { const [n, d] = scaleStr.split('/').map(Number); return n / d; })()
    : parseFloat(scaleStr);
  if (!inches || inches <= 0) return null;
  const inchesPerFoot = inches / feet; // paper inches per real foot
  const pixelsPerUnit = inchesPerFoot * PDF_DPI; // points per foot
  const label = `${scaleStr}" = ${feet}'-0"`;
  return {
    scale: { pixelsPerUnit, unit: 'ft', label, source: 'auto', confidence: 0.92 },
    confidence: 0.92,
    matchIndex: m.index ?? text.indexOf(label),
  };
}

// Parse metric ratio like 1:100 or Scale: 1:50
function parseMetric(text: string): DetectedScaleResult | null {
  const m = /(?:scale\s*[:=]?\s*)?1\s*:\s*(\d+)/i.exec(text);
  if (!m) return null;
  const ratio = parseInt(m[1], 10);
  if (!ratio || ratio <= 0) return null;
  // 1:100 → 1 paper unit = 100 real units; 1 meter = 39.3701 inches
  const pixelsPerUnit = (PDF_DPI * 39.3701) / ratio; // points per meter
  return {
    scale: { pixelsPerUnit, unit: 'm', label: `1:${ratio}`, source: 'auto', confidence: 0.85 },
    confidence: 0.85,
    matchIndex: m.index ?? text.indexOf(`1:${ratio}`),
  };
}

// Alias for consumer convenience
export type DetectedScale = DetectedScaleResult;

// Convert a DetectedScaleResult to a ScaleCalibration
export function detectedToCalibration(d: DetectedScaleResult): ScaleCalibration {
  return d.scale;
}

export function detectScaleFromText(raw: string): DetectedScaleResult | null {
  if (!raw) return null;
  // Normalize newlines → spaces; keep dashes
  const t = raw.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  return parseImperial(t) || parseMetric(t);
}
