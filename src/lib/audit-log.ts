export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  resource: string;
  resourceId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

const STORAGE_KEY = 'mx-audit-log';
const MAX_ENTRIES = 200;

export function createAuditEntry(
  action: string,
  resource: string,
  resourceId: string,
  metadata?: Record<string, unknown>,
): AuditEntry {
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action,
    resource,
    resourceId,
    metadata,
  };

  // Persist to localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const entries: AuditEntry[] = raw ? JSON.parse(raw) : [];
    entries.push(entry);
    // Keep only the most recent MAX_ENTRIES
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage unavailable — continue silently
  }

  // Fire-and-forget POST to server
  // NOTE: The server-side /api/audit-log endpoint MUST enforce authentication
  // and rate limiting (e.g., max 60 requests/min per user) to prevent abuse.
  // See BUG-A5-6-148. Auth is enforced server-side; no client-side fix needed.
  fetch('/api/audit-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, resource, resourceId, metadata }),
  }).catch(() => {
    // Silently ignore network errors
  });

  return entry;
}

export function getAuditLog(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
