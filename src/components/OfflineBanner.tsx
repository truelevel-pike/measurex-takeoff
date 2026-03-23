'use client';

import { useEffect, useState } from 'react';

export default function OfflineBanner() {
  // Start as false (online) on server + initial client render to avoid hydration mismatch
  const [offline, setOffline] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOffline(!navigator.onLine);

    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!mounted || !offline) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[99998] bg-amber-400 text-[#1a1a2e] text-center font-semibold text-sm px-4 py-2"
      role="alert"
      aria-live="assertive"
      data-testid="offline-banner"
      suppressHydrationWarning
    >
      ⚠️ You are offline. Changes may not be saved.
    </div>
  );
}
