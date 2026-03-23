import type { ScaleCalibration } from './types';

export interface DetectedScaleResult {
  scale: ScaleCalibration;
  confidence: number;
  matchIndex: number;
}

export type DetectedScale = DetectedScaleResult;

const PDF_DPI = 72;

interface Candidate {
  scale: ScaleCalibration;
  confidence: number;
  matchIndex: number;
}

function normalizeScaleText(text: string): string {
  return text
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\bfeet\b/gi, 'ft')
    .replace(/\bfoot\b/gi, 'ft')
    .replace(/\binches\b/gi, 'in')
    .replace(/\binch\b/gi, 'in')
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseInchesToken(token: string): number | null {
  const cleaned = token.trim().replace(/(\d)-(\d+\/\d+)/, '$1 $2');

  const mixed = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den === 0) return null;
    return whole + num / den;
  }

  const fraction = cleaned.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (den === 0) return null;
    return num / den;
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function hasScalePrefix(prefix: string | undefined): boolean {
  return Boolean(prefix && /\bscale\b/i.test(prefix));
}

function hasNts(text: string): boolean {
  return /\bN\.?T\.?S\.?\b/i.test(text) || /\bNOT\s+TO\s+SCALE\b/i.test(text);
}

function addCandidate(
  candidates: Candidate[],
  pixelsPerFoot: number,
  label: string,
  confidence: number,
  matchIndex: number,
): void {
  if (!Number.isFinite(pixelsPerFoot) || pixelsPerFoot <= 0) return;

  candidates.push({
    scale: {
      pixelsPerUnit: pixelsPerFoot,
      unit: 'ft',
      label,
      source: 'auto',
      confidence,
    },
    confidence,
    matchIndex,
  });
}

function collectArchitecturalAndCivil(text: string, candidates: Candidate[]): void {
  // BUG-A5-6-187: escape hyphen in character class to avoid unintended range
  const inchesToken = '(\\d+(?:\\.\\d+)?(?:[\\s\\-]\\d+\\/\\d+)?|\\d+\\/\\d+)';
  const prefix = '(\\bscale\\b\\s*:?\\s*)?';
  const inchUnit = '(?:"|in)';
  const footUnit = "(?:'|ft)";
  const footTail = '(?:\\s*[-]\\s*0\\s*(?:"|in)?)?';

  const clear = new RegExp(
    `${prefix}${inchesToken}\\s*${inchUnit}\\s*=\\s*(\\d+(?:\\.\\d+)?)\\s*${footUnit}${footTail}`,
    'gi',
  );

  for (const match of text.matchAll(clear)) {
    const pref = match[1];
    const paperToken = match[2];
    const realFeet = Number(match[3]);
    const paperInches = parseInchesToken(paperToken);

    if (!paperInches || !Number.isFinite(realFeet) || realFeet <= 0) continue;

    const isLabeled = hasScalePrefix(pref);
    const confidence = isLabeled ? 0.95 : 0.85;
    const label = `${paperToken.replace(/\s+/g, ' ').trim()}\" = ${realFeet}'-0\"`;
    const pixelsPerFoot = (paperInches * PDF_DPI) / realFeet;

    addCandidate(candidates, pixelsPerFoot, label, confidence, match.index ?? 0);
  }

  const fuzzy = new RegExp(
    `${prefix}${inchesToken}\\s*${inchUnit}\\s*(?:to|[-]|\\/)?\\s*(\\d+(?:\\.\\d+)?)\\s*${footUnit}`,
    'gi',
  );

  for (const match of text.matchAll(fuzzy)) {
    const pref = match[1];
    const paperToken = match[2];
    const realFeet = Number(match[3]);
    const paperInches = parseInchesToken(paperToken);

    if (!paperInches || !Number.isFinite(realFeet) || realFeet <= 0) continue;

    const isLabeled = hasScalePrefix(pref);
    const confidence = isLabeled ? 0.85 : 0.65;
    const label = `${paperToken.replace(/\s+/g, ' ').trim()}\" = ${realFeet}'`;
    const pixelsPerFoot = (paperInches * PDF_DPI) / realFeet;

    addCandidate(candidates, pixelsPerFoot, label, confidence, match.index ?? 0);
  }
}

// BUG-A7-4-012: detect metric ratios instead of hardcoding unit='ft'
function collectRatios(text: string, candidates: Candidate[]): void {
  const ratio = /(\bscale\b\s*:?\s*)?1\s*:\s*(\d{1,5})/gi;

  // Common architectural ft ratios (denominator = inches-per-foot * factor)
  const ARCH_FT_DENOMS = new Set([5, 10, 20, 24, 48, 50, 60, 96, 100, 120, 125, 150, 200, 240, 250, 300, 480, 500]);

  for (const match of text.matchAll(ratio)) {
    const denominator = Number(match[2]);
    if (!Number.isFinite(denominator) || denominator <= 0) continue;

    const label = `1:${denominator}`;
    const isLabeled = Boolean(match[1] && /\bscale\b/i.test(match[1]));
    const confidence = isLabeled ? 0.85 : 0.75;

    if (ARCH_FT_DENOMS.has(denominator)) {
      // Architectural / imperial: pixels per foot
      const pixelsPerFoot = PDF_DPI / (denominator / 12);
      addCandidate(candidates, pixelsPerFoot, label, confidence, match.index ?? 0);
    } else {
      // BUG-A5-5-039: use addCandidate-style guard for metric candidates
      const pixelsPerMeter = (PDF_DPI / denominator) * (1000 / 25.4);
      if (Number.isFinite(pixelsPerMeter) && pixelsPerMeter > 0) {
        candidates.push({
          scale: {
            pixelsPerUnit: pixelsPerMeter,
            unit: 'm',
            label,
            source: 'auto',
            confidence,
          },
          confidence,
          matchIndex: match.index ?? 0,
        });
      }
    }
  }
}

export function detectedToCalibration(detected: DetectedScaleResult): ScaleCalibration {
  return detected.scale;
}

export function detectScaleFromText(text: string): DetectedScaleResult | null {
  if (!text?.trim()) return null;

  const normalized = normalizeScaleText(text);
  if (!normalized) return null;
  if (hasNts(normalized)) return null;

  const candidates: Candidate[] = [];

  collectArchitecturalAndCivil(normalized, candidates);
  collectRatios(normalized, candidates);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.matchIndex - b.matchIndex;
  });

  return {
    scale: candidates[0].scale,
    confidence: candidates[0].confidence,
    matchIndex: candidates[0].matchIndex,
  };
}

/** Wave 19B: exported NTS detector so callers can show 'Not to Scale' warning. */
export function isNotToScale(text: string): boolean {
  if (!text?.trim()) return false;
  return hasNts(normalizeScaleText(text));
}
