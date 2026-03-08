import { useEffect, useState } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatArea(value: number, unit: 'ft'|'in'|'m'|'mm'|'px' = 'px') {
  return `${Number.isFinite(value) ? value.toFixed(2) : '0.00'} sq ${unit}`;
}

export function formatLength(value: number, unit: 'ft'|'in'|'m'|'mm'|'px' = 'px') {
  return `${Number.isFinite(value) ? value.toFixed(2) : '0.00'} ${unit}`;
}

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}
