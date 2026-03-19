'use client';

import { useEffect, useState } from 'react';

export default function OfflineBanner() {
  const [offline, setOffline] = useState(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

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
        padding: offline ? '8px 16px' : '0 16px',
        maxHeight: offline ? 40 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.3s ease, padding 0.3s ease',
      }}
      role="alert"
    >
      {offline && '\u26A0\uFE0F You are offline. Changes may not be saved.'}
    </div>
  );
}
