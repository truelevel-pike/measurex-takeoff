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
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99998,
        background: '#f59e0b',
        color: '#1a1a2e',
        textAlign: 'center',
        fontWeight: 600,
        fontSize: 14,
        padding: '8px 16px',
      }}
      role="alert"
    >
      ⚠️ You are offline. Changes may not be saved.
    </div>
  );
}
