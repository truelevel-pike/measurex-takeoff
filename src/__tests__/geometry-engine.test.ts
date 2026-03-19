jest.mock('@turf/turf', () => ({}));

import { calculatePolygonArea, calculateLinearFeet, distance, pointInPolygon } from '@/lib/polygon-utils';

describe('calculatePolygonArea', () => {
  it('returns 0 for empty polygon', () => {
    expect(calculatePolygonArea([])).toBe(0);
  });

  it('calculates area of a unit square in pixels', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const area = calculatePolygonArea(square);
    expect(area).toBeCloseTo(10000, 0);
  });

  it('calculates area for a triangle', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 100 },
    ];
    const area = calculatePolygonArea(triangle);
    expect(area).toBeCloseTo(5000, 0);
  });

  it('returns 0 for fewer than 3 points', () => {
    expect(calculatePolygonArea([{ x: 0, y: 0 }])).toBe(0);
    expect(calculatePolygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });
});

describe('calculateLinearFeet', () => {
  it('returns 0 for empty path', () => {
    expect(calculateLinearFeet([])).toBe(0);
  });

  it('calculates length of a straight horizontal line', () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(calculateLinearFeet(line)).toBeCloseTo(100, 1);
  });

  it('calculates length of a straight horizontal line (open)', () => {
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(calculateLinearFeet(line, 1, false)).toBeCloseTo(100, 1);
  });

  it('calculates perimeter of a square', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const length = calculateLinearFeet(square);
    expect(length).toBeCloseTo(400, 1);
  });
});

describe('distance', () => {
  it('returns 0 for same point', () => {
    expect(distance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
  });

  it('calculates horizontal distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3);
  });

  it('calculates diagonal distance', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('pointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('returns true for point inside', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
  });

  it('returns false for point outside', () => {
    expect(pointInPolygon({ x: 200, y: 200 }, square)).toBe(false);
  });
});
