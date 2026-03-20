/**
 * Feature flags — check env vars (server + client) and localStorage (client only).
 */

// NOTE: There are two flag systems in this file:
// 1. Legacy flags (DEFAULT_FLAGS / isEnabled / getFlags) — used by older code paths,
//    reads from FEATURE_FLAGS env var as a JSON blob. Kept for backwards compatibility.
// 2. Wave 12 typed flags (FlagName / getFlag / setFlag / getAllFlags) — the current system,
//    reads per-flag env vars (NEXT_PUBLIC_*), server overrides, and localStorage.
// New code should use the Wave 12 API (getFlag/setFlag). Legacy flags are frozen and
// will be migrated or removed in a future cleanup pass.

const DEFAULT_FLAGS = {
  "ai-takeoff": true,
  "3d-view": true,
  "webhook-support": true,
  "offline-mode": true,
  "estimate-summary": true,
  "revision-history": true,
  "drawing-comparison": true,
  "contractor-report": false,  // requires enterprise
  "plugin-system": false,      // experimental
} as const;

type LegacyFlagName = keyof typeof DEFAULT_FLAGS;

// ── Wave 12 typed flags ──────────────────────────────────────────────

export type FlagName =
  | 'ENABLE_3D_VIEW'
  | 'ENABLE_COLLABORATION'
  | 'ENABLE_WEBHOOKS'
  | 'ENABLE_AI_IMAGE_SEARCH';

export const FLAG_NAMES: FlagName[] = [
  'ENABLE_3D_VIEW',
  'ENABLE_COLLABORATION',
  'ENABLE_WEBHOOKS',
  'ENABLE_AI_IMAGE_SEARCH',
];

const flagDefaults: Record<FlagName, boolean> = {
  ENABLE_3D_VIEW: true,
  ENABLE_COLLABORATION: true,
  ENABLE_WEBHOOKS: true,
  ENABLE_AI_IMAGE_SEARCH: true,
};

/** Server-side override map (set via POST /api/flags) */
const serverOverrides = new Map<FlagName, boolean>();

export function setServerFlag(name: FlagName, value: boolean): void {
  serverOverrides.set(name, value);
}

const isClient = typeof window !== 'undefined';

export function getFlag(name: FlagName): boolean {
  // 1. Check env var
  const envKey = `NEXT_PUBLIC_${name}`;
  const envVal =
    typeof process !== 'undefined' && process.env
      ? process.env[envKey]
      : undefined;
  if (envVal === 'false') return false;
  if (envVal === 'true') return true;

  // 2. Server-side override
  if (serverOverrides.has(name)) return serverOverrides.get(name)!;

  // 3. Client-side localStorage
  if (isClient) {
    try {
      const stored = localStorage.getItem(`flag:${name}`);
      if (stored === 'false') return false;
      if (stored === 'true') return true;
    } catch {
      // localStorage unavailable
    }
  }

  return flagDefaults[name];
}

export function setFlag(name: FlagName, value: boolean): void {
  if (!isClient) return;
  try {
    localStorage.setItem(`flag:${name}`, String(value));
  } catch {
    // localStorage unavailable
  }
}

export function getAllFlags(): Record<FlagName, boolean> {
  const result = {} as Record<FlagName, boolean>;
  for (const name of FLAG_NAMES) {
    result[name] = getFlag(name);
  }
  return result;
}

// ── Legacy API (preserved for backwards compatibility) ───────────────

function loadFlags(): Record<string, boolean> {
  const flags: Record<string, boolean> = { ...DEFAULT_FLAGS };

  const envOverrides = process.env.FEATURE_FLAGS;
  if (envOverrides) {
    try {
      const parsed = JSON.parse(envOverrides);
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "boolean") {
          flags[key] = value;
        }
      }
    } catch {
      console.warn("Failed to parse FEATURE_FLAGS env var");
    }
  }

  return flags;
}

const legacyFlags = loadFlags();

export function isEnabled(flag: LegacyFlagName | string): boolean {
  return legacyFlags[flag] ?? false;
}

export function getFlags(): Record<string, boolean> {
  return { ...legacyFlags };
}
