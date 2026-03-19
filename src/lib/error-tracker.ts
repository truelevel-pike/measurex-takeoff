/**
 * Lightweight error tracker with a circular buffer (last 50 errors).
 * Wires to window.onerror / window.onunhandledrejection on the client.
 */

const MAX_ERRORS = 50;

export interface ErrorEntry {
  timestamp: string;
  message: string;
  stack?: string;
  context: Record<string, unknown>;
}

const buffer: ErrorEntry[] = [];

/**
 * Record an error into the circular buffer.
 */
export function captureError(
  error: Error | unknown,
  context: Record<string, unknown> = {},
): void {
  const entry: ErrorEntry = {
    timestamp: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
  };

  if (buffer.length >= MAX_ERRORS) {
    buffer.shift();
  }
  buffer.push(entry);

  // Also log for dev visibility
  console.error("[mx:error-tracker]", entry.message);
}

/**
 * Return all captured errors (oldest first).
 */
export function getErrors(): ErrorEntry[] {
  return [...buffer];
}

// ── Wire up global handlers (client-side only) ────────────────────────
// Use addEventListener instead of overwriting window.onerror / window.onunhandledrejection
// so we don't break Next.js's own error handlers (which causes the dev "Issues" badge).

if (typeof window !== "undefined") {
  window.addEventListener("error", (event: ErrorEvent) => {
    captureError(event.error ?? event.message, {
      source: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    captureError(event.reason, { type: "unhandledrejection" });
  });
}
