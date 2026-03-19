import { extractSheetName } from '@/lib/sheet-namer';

describe('extractSheetName', () => {
  it('extracts sheet number from standard format', () => {
    const result = extractSheetName('A1 FLOOR PLAN\nsome other text');
    expect(result).toBeTruthy();
    expect(result).toContain('A1');
  });

  it('extracts floor plan type', () => {
    const result = extractSheetName('SHEET A2\nFIRST FLOOR PLAN');
    expect(result).toBeTruthy();
    expect(result!.toLowerCase()).toContain('floor');
  });

  it('returns null for empty text', () => {
    const result = extractSheetName('');
    expect(result).toBeNull();
  });

  it('handles elevation sheets', () => {
    const result = extractSheetName('A3\nEXTERIOR ELEVATIONS');
    expect(result).toBeTruthy();
  });

  it('extracts standard architectural sheet numbers', () => {
    const result = extractSheetName('A1.01 FIRST FLOOR PLAN');
    expect(result).toBeTruthy();
    expect(result).toContain('A1.01');
  });
});
