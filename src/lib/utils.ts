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
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return false;
    return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

export function useIsTablet() {
  const [isTablet, setIsTablet] = useState(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return false;
    return window.matchMedia('(min-width: 769px) and (max-width: 1024px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const mql = window.matchMedia('(min-width: 769px) and (max-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsTablet(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isTablet;
}
