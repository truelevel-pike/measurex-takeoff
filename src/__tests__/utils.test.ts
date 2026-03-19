import { cn, formatArea, formatLength } from '@/lib/utils';

describe('cn (classnames utility)', () => {
  it('combines class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'not-included', 'included')).toBe('base included');
  });

  it('deduplicates tailwind classes', () => {
    const result = cn('text-sm', 'text-lg');
    expect(result).not.toBe('text-sm text-lg');
  });
});

describe('formatArea', () => {
  it('formats area with default unit', () => {
    const result = formatArea(100);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('formats area with ft unit', () => {
    const result = formatArea(100, 'ft');
    expect(result).toContain('ft');
  });
});

describe('formatLength', () => {
  it('formats length with default unit', () => {
    const result = formatLength(100);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('formats length with ft unit', () => {
    const result = formatLength(50, 'ft');
    expect(result).toContain('ft');
  });
});
