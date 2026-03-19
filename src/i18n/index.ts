'use client';

import { useCallback, useSyncExternalStore } from 'react';
import en from './en.json';
import es from './es.json';

const LOCALE_KEY = 'mx-locale';
type Locale = 'en' | 'es';

const translations: Record<Locale, Record<string, string>> = { en, es };
const supportedLocales: Locale[] = ['en', 'es'];

// Simple external store so all components re-render on locale change
let currentLocale: Locale = 'en';
const listeners = new Set<() => void>();

function getSnapshot(): Locale {
  return currentLocale;
}

function getServerSnapshot(): Locale {
  return 'en';
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function initLocale(): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored && supportedLocales.includes(stored as Locale)) {
      currentLocale = stored as Locale;
    }
  } catch {
    // ignore
  }
}

// Initialise on module load (client only)
initLocale();

/** Change the active locale and persist to localStorage. */
export function setLocale(locale: Locale): void {
  if (!supportedLocales.includes(locale)) return;
  currentLocale = locale;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(LOCALE_KEY, locale);
    } catch {
      // ignore
    }
  }
  listeners.forEach((cb) => cb());
}

/**
 * React hook — returns a `t()` translation function bound to the current locale.
 * Re-renders automatically when locale changes via `setLocale()`.
 */
export function useTranslation() {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const t = useCallback(
    (key: string): string => {
      return translations[locale]?.[key] ?? translations.en[key] ?? key;
    },
    [locale],
  );

  return { t, locale };
}
