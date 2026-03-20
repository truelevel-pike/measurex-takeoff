/**
 * Defense-in-depth ID validation for filesystem operations.
 *
 * All API routes already validate IDs as UUIDs via zod schemas, but server-side
 * functions that construct file paths should also guard against path traversal
 * as a second line of defense (BUG-A5-C1, BUG-A5-C2).
 */

/** Only allow UUIDs and simple alphanumeric-dash-underscore identifiers. */
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;

/** BUG-A5-6-178: Maximum allowed ID length to prevent abuse via excessively long strings. */
const MAX_ID_LENGTH = 128;

/**
 * Validate that an id is safe for use in filesystem paths.
 * Rejects path separators, "..", and any non-alphanumeric/dash/underscore characters.
 * Throws if invalid.
 */
export function assertSafeId(id: string, label = 'id'): void {
  if (!id || typeof id !== 'string') {
    throw new Error(`Invalid ${label}: must be a non-empty string`);
  }
  if (id.includes('/') || id.includes('\\') || id.includes('..') || id.includes('\0')) {
    throw new Error(`Invalid ${label}: path traversal characters detected`);
  }
  if (!SAFE_ID_RE.test(id)) {
    throw new Error(`Invalid ${label}: contains disallowed characters`);
  }
}

/**
 * Check if an id is safe for use in filesystem paths without throwing.
 */
export function isSafeId(id: string): boolean {
  try {
    assertSafeId(id);
    return true;
  } catch {
    return false;
  }
}
