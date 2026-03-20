'use client';

// BUG-A8-5-024 fix: show "Update available — reload" banner when a new service worker
// is waiting. Clicking the button sends SKIP_WAITING to the waiting SW (which is already
// wired in src/sw.ts) and reloads to pick up the new version.
//
// Without this, skipWaiting: false means the old SW persists until ALL tabs with the app
// are closed, which can be indefinitely on long-running sessions.

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

export default function SWUpdateBanner() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const checkForWaiting = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
      }
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New SW is ready and waiting — notify user
            setWaitingWorker(newWorker);
          }
        });
      });
    };

    navigator.serviceWorker.ready.then(checkForWaiting);

    // Also check existing registrations
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach(checkForWaiting);
    });
  }, []);

  if (!waitingWorker) return null;

  const handleUpdate = () => {
    waitingWorker.postMessage('SKIP_WAITING');
    // Reload once the new SW takes control
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  };

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-3 bg-gray-900 border border-green-500/50 text-white px-5 py-3 rounded-xl shadow-2xl text-sm"
      role="status"
      aria-live="polite"
    >
      <RefreshCw size={14} className="text-green-400 shrink-0" />
      <span className="text-gray-200">A new version is available.</span>
      <button
        onClick={handleUpdate}
        className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-lg font-medium transition-colors text-xs"
      >
        Update now
      </button>
      <button
        onClick={() => setWaitingWorker(null)}
        className="text-gray-500 hover:text-white ml-1 transition-colors"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
