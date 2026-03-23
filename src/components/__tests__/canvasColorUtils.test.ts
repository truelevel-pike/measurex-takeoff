// Tests for hexToRgba and getPolygonColor edge cases
// Import from lightweight util (no turf/kdbush ESM dependency chain)
import { hexToRgba, getPolygonColor } from '../../lib/canvas-color-utils';

describe('hexToRgba', () => {
  it('converts valid 6-char hex', () => {
    expect(hexToRgba('#3b82f6', 0.3)).toBe('rgba(59,130,246,0.3)');
  });

  it('converts valid 3-char hex', () => {
    expect(hexToRgba('#fff', 0.5)).toBe('rgba(255,255,255,0.5)');
  });

  it('falls back on empty string', () => {
    expect(hexToRgba('', 0.3)).toBe('rgba(147,197,253,0.3)');
  });

  it('falls back on invalid hex', () => {
    expect(hexToRgba('notacolor', 0.5)).toBe('rgba(147,197,253,0.5)');
  });
});

describe('getPolygonColor', () => {
  it('returns polygon color when set', () => {
    expect(getPolygonColor({ color: '#ff0000' }, '#0000ff')).toBe('#ff0000');
  });

  it('returns classification color as fallback', () => {
    expect(getPolygonColor({}, '#0000ff')).toBe('#0000ff');
  });

  it('returns default when both are empty', () => {
    expect(getPolygonColor({ color: '' }, '')).toBe('#93c5fd');
  });

  it('returns default when no colors provided', () => {
    expect(getPolygonColor({}, undefined)).toBe('#93c5fd');
  });
});
