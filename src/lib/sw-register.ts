'use client';

/**
 * registerServiceWorker — registers /sw.js for offline support.
 * Call this once in the root layout or app shell.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          console.log('[SW] Registered:', reg.scope);
        })
        .catch((err) => {
          if (process.env.NODE_ENV !== 'production') return;
          console.warn('[SW] Registration failed:', err);
        });
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') return;
      console.warn('[SW] Registration failed:', e);
    }
  });
}
