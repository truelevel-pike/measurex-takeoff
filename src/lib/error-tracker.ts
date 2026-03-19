const STORAGE_KEY = "mx_errors";
const MAX_ERRORS = 50;

export interface TrackedErrorEntry {
  timestamp: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  userAgent: string;
  url: string;
}

function readStoredErrors(): TrackedErrorEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as TrackedErrorEntry[];
  } catch {
    return [];
  }
}

export function trackError(error: Error, context?: Record<string, unknown>): void {
  const entry: TrackedErrorEntry = {
    timestamp: new Date().toISOString(),
    message: error.message,
    stack: error.stack,
    context,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    url: typeof window !== "undefined" ? window.location.href : "unknown",
  };

  if (typeof window !== "undefined") {
    try {
      const existing = readStoredErrors();
      existing.push(entry);
      const trimmed = existing.slice(-MAX_ERRORS);
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Ignore storage failures and still emit to console for visibility.
    }
  }

  console.error("[mx:error-tracker]", entry);
}
