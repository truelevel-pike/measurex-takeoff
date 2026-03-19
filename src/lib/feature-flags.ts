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

type FlagName = keyof typeof DEFAULT_FLAGS;

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

const flags = loadFlags();

export function isEnabled(flag: FlagName | string): boolean {
  return flags[flag] ?? false;
}

export function getFlags(): Record<string, boolean> {
  return { ...flags };
}
