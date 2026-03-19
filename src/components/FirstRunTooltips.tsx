'use client';

import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'mx-first-run-tooltips-shown';

const tooltips = [
  {
    id: 'takeoff',
    label: '✨ Try AI Takeoff! Auto-detect all quantities from your drawing.',
    style: { position: 'fixed' as const, right: 280, top: 56 },
    arrow: '↗',
  },
  {
    id: 'quantities',
    label: '📊 Your measurements appear here after running a takeoff.',
    style: { position: 'fixed' as const, right: 8, top: '50%', transform: 'translateY(-50%)' },
    arrow: '→',
  },
  {
    id: 'scale',
    label: '📐 Set scale first for accurate measurements!',
    style: { position: 'fixed' as const, left: '50%', top: 56, transform: 'translateX(-50%)' },
    arrow: '↑',
  },
];

export default function FirstRunTooltips() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === 'true') return;
    const timer = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const autoHide = setTimeout(() => dismiss(), 8000);
    return () => clearTimeout(autoHide);
  }, [visible]);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  };

  if (!visible) return null;

  return (
    <div className="pointer-events-auto" style={{ zIndex: 9999 }}>
      {tooltips.map((t) => (
        <div
          key={t.id}
          className="bg-zinc-800 border border-blue-500/50 rounded-lg p-3 text-sm text-white shadow-xl max-w-[260px]"
          style={{
            ...t.style,
            animation: 'fadeIn 0.3s ease-out',
          }}
        >
          <div className="flex items-start gap-2">
            <span className="text-blue-400 text-base leading-none">{t.arrow}</span>
            <span className="flex-1">{t.label}</span>
            <button
              onClick={dismiss}
              className="text-zinc-400 hover:text-white ml-1 text-base leading-none"
            >
              ×
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={dismiss}
        className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-xl"
        style={{ animation: 'fadeIn 0.3s ease-out' }}
      >
        Got it!
      </button>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
