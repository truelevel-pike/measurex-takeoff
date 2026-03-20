const DEFAULT_COLOR = '#3b82f6';
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

export function sanitizeName(input: unknown): string | null {
  if (typeof input !== 'string') return null;

  // Decode HTML entities first, then strip tags, decode again in case entities contained tags
  const decoded = input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  const sanitized = decoded.trim().replace(/<[^>]*>/g, '').trim();
  if (!sanitized) return null;
  if (sanitized.length > 200) return null;

  return sanitized;
}

export function validatePoints(input: unknown): { x: number; y: number }[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length < 3 || input.length > 500) return null;

  const points: { x: number; y: number }[] = [];

  for (const point of input) {
    if (!point || typeof point !== 'object') return null;

    const { x, y } = point as { x?: unknown; y?: unknown };
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    points.push({ x, y });
  }

  return points;
}

export function sanitizeColor(input: unknown): string {
  if (typeof input !== 'string') return DEFAULT_COLOR;

  const color = input.trim();
  return HEX_COLOR_REGEX.test(color) ? color : DEFAULT_COLOR;
}
