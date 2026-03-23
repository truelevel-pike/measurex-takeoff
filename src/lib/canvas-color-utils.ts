/**
 * Lightweight canvas color utilities — no heavy dependencies.
 * Extracted so tests can import without pulling in turf/kdbush ESM chain.
 */

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (!clean || (clean.length !== 3 && clean.length !== 6)) return `rgba(147,197,253,${alpha})`;
  let r: number, g: number, b: number;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

export function getPolygonColor(
  polygon: { color?: string },
  classificationColor?: string,
): string {
  const polygonColor = polygon.color?.trim();
  if (polygonColor) return polygonColor;
  return classificationColor?.trim() || '#93c5fd';
}
