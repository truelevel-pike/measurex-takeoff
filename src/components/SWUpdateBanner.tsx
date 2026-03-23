'use client';

// BUG-A8-5-024 fix: show "Update available — reload" banner when a new service worker
// is waiting. Clicking the button sends SKIP_WAITING to the waiting SW (which is already
// wired in src/sw.ts) and reloads to pick up the new version.
//
// Without this, skipWaiting: false means the old SW persists until ALL tabs with the app
// are closed, which can be indefinitely on long-running sessions.
//
// BUG-W15-002: throttle the banner — only show after 60s on page and once per session,
// so it doesn't pop up aggressively on every reload.

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const SESSION_KEY = 'mx-sw-update-shown';

export default function SWUpdateBanner() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [visible, setVisible] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // Only show once per session
    if (sessionStorage.getItem(SESSION_KEY)) return;

    const notifyWorker = (worker: ServiceWorker) => {
      setWaitingWorker(worker);
      // Delay banner appearance by 60s — don't interrupt the user immediately
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      showTimerRef.current = setTimeout(() => {
        // Re-check session flag in case another tab already showed it
        if (!sessionStorage.getItem(SESSION_KEY)) {
          setVisible(true);
          sessionStorage.setItem(SESSION_KEY, '1');
        }
      }, 60_000);
    };

    const checkForWaiting = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) {
        notifyWorker(reg.waiting);
      }
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            notifyWorker(newWorker);
          }
        });
      });
    };

    navigator.serviceWorker.ready.then(checkForWaiting);

    // Also check existing registrations
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach(checkForWaiting);
    });

    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
    };
  }, []);

  if (!waitingWorker || !visible) return null;

  const handleUpdate = () => {
    waitingWorker.postMessage('SKIP_WAITING');
    // Reload once the new SW takes control
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    }, { once: true });
  };

  const handleDismiss = () => {
    setVisible(false);
    setWaitingWorker(null);
  };

  // Subtle bottom-right toast — not a full-width overlay
  return (
    <div
      className="fixed bottom-4 right-4 z-[9999] flex items-center gap-2 bg-gray-900/95 border border-gray-700 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs max-w-xs"
      role="status"
      aria-live="polite"
    >
      <RefreshCw size={12} className="text-green-400 shrink-0" />
      <span className="text-gray-300 flex-1">Update available</span>
      <button
        onClick={handleUpdate}
        className="text-green-400 hover:text-green-300 font-medium transition-colors underline underline-offset-2"
      >
        Reload
      </button>
      <button
        onClick={handleDismiss}
        className="text-gray-600 hover:text-gray-400 ml-1 transition-colors"
        aria-label="Dismiss update banner"
      >
        ✕
      </button>
    </div>
  );
}
