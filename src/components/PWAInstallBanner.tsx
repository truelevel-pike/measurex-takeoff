'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

const DISMISSED_KEY = 'pwa-install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    setDismissed(false);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  };

  // Suppress in agent mode to prevent UI interruptions during automated sessions
  const agentMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('agent') === '1';
  if (agentMode || dismissed || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#10131d] border border-[rgba(0,212,255,0.3)] rounded-lg px-4 py-3 shadow-2xl max-w-md">
      <Download size={18} className="text-[#00d4ff] shrink-0" />
      <span className="text-sm text-zinc-200">
        Install MeasureX as an app &mdash; Get faster access
      </span>
      <button
        onClick={handleInstall}
        className="px-3 py-1.5 text-xs font-medium bg-[#00d4ff] text-black rounded hover:bg-[#00b8d9] transition-colors shrink-0"
      >
        Install
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss install banner"
        className="text-zinc-400 hover:text-white transition-colors shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
}
