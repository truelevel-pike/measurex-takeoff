/**
 * Extracts a meaningful sheet name from PDF page text content.
 * Parses common architectural/engineering sheet naming patterns.
 */

// Architectural sheet number patterns like A0.00, A1.01, S2.1, M1.0, E3.01, P1.0
const SHEET_NUMBER_RE = /\b([ASMEPC]\d{1,2}[.\-]\d{1,3})\b/i;

// "SHEET N OF M" pattern
const SHEET_OF_RE = /\bSHEET\s+(\d+)\s+OF\s+(\d+)\b/i;

// Common sheet title keywords (ordered by specificity)
const TITLE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bCOVER\s+SHEET\b/i, label: 'COVER SHEET' },
  { re: /\bTITLE\s+SHEET\b/i, label: 'TITLE SHEET' },
  { re: /\bSITE\s+PLAN\b/i, label: 'SITE PLAN' },
  { re: /\bROOF\s+PLAN\b/i, label: 'ROOF PLAN' },
  { re: /\bFLOOR\s+PLAN\b/i, label: 'FLOOR PLAN' },
  { re: /\bFOUNDATION\s+PLAN\b/i, label: 'FOUNDATION PLAN' },
  { re: /\bFRAMING\s+PLAN\b/i, label: 'FRAMING PLAN' },
  { re: /\bDEMOLITION\s+PLAN\b/i, label: 'DEMOLITION PLAN' },
  { re: /\bELECTRICAL\s+PLAN\b/i, label: 'ELECTRICAL PLAN' },
  { re: /\bPLUMBING\s+PLAN\b/i, label: 'PLUMBING PLAN' },
  { re: /\bMECHANICAL\s+PLAN\b/i, label: 'MECHANICAL PLAN' },
  { re: /\bLANDSCAPE\s+PLAN\b/i, label: 'LANDSCAPE PLAN' },
  { re: /\bELEVATIONS?\b/i, label: 'ELEVATIONS' },
  { re: /\bSECTIONS?\b/i, label: 'SECTIONS' },
  { re: /\bDETAILS?\b/i, label: 'DETAILS' },
  { re: /\bELECTRICAL\b/i, label: 'ELECTRICAL' },
  { re: /\bPLUMBING\b/i, label: 'PLUMBING' },
  { re: /\bMECHANICAL\b/i, label: 'MECHANICAL' },
  { re: /\bSCHEDULE\b/i, label: 'SCHEDULE' },
];

export function extractSheetName(pageText: string): string | null {
  if (!pageText?.trim()) return null;

  const text = pageText.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Try to find an architectural sheet number (e.g. A1.00)
  const sheetNumMatch = text.match(SHEET_NUMBER_RE);
  const sheetNumber = sheetNumMatch ? sheetNumMatch[1].toUpperCase() : null;

  // 2. Try to find a descriptive title
  let titleLabel: string | null = null;
  for (const { re, label } of TITLE_PATTERNS) {
    if (re.test(text)) {
      titleLabel = label;
      break;
    }
  }

  // 3. Try "SHEET N OF M"
  const sheetOfMatch = text.match(SHEET_OF_RE);

  // Combine: prefer "A1.00 — FLOOR PLAN" style
  if (sheetNumber && titleLabel) {
    return `${sheetNumber} — ${titleLabel}`;
  }
  if (sheetNumber) {
    return sheetNumber;
  }
  if (titleLabel) {
    return titleLabel;
  }
  if (sheetOfMatch) {
    return `SHEET ${sheetOfMatch[1]} OF ${sheetOfMatch[2]}`;
  }

  return null;
}
