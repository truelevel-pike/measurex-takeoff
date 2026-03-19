'use client';

import { useState } from 'react';
import { getAllFlags, setFlag, FLAG_NAMES, type FlagName } from '@/lib/feature-flags';

export default function FeatureFlagPanel() {
  const [flags, setFlags] = useState<Record<FlagName, boolean>>(() => getAllFlags());

  function handleToggle(name: FlagName) {
    const next = !flags[name];
    setFlag(name, next);
    setFlags((prev) => ({ ...prev, [name]: next }));
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Feature Flags (Admin)</h2>
      <div className="space-y-3">
        {FLAG_NAMES.map((name) => (
          <div key={name} className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">{name}</span>
            <button
              type="button"
              role="switch"
              aria-checked={flags[name]}
              onClick={() => handleToggle(name)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                flags[name] ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  flags[name] ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
