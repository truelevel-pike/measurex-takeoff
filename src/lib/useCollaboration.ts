/**
 * P4-01: useCollaboration hook
 *
 * Builds on the existing SSE /api/ws stream to track other active viewers.
 * Sends cursor position updates via a POST endpoint and receives collaborator
 * cursors through the SSE stream.
 *
 * Degrades gracefully in single-user mode — no errors if no other users present.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from './store';
import { subscribeToActivity } from './ws-client';

// Palette for auto-assigning collaborator colors
const COLLABORATOR_COLORS = [
  '#f87171', '#fb923c', '#facc15', '#4ade80',
  '#34d399', '#22d3ee', '#818cf8', '#e879f9',
];

let colorIndex = 0;
function nextColor(): string {
  return COLLABORATOR_COLORS[colorIndex++ % COLLABORATOR_COLORS.length];
}

interface UseCollaborationResult {
  collaborators: Array<{ id: string; name: string; color: string; cursor?: { x: number; y: number; page: number }; lastSeen: number }>;
  isConnected: boolean;
  sendCursorUpdate: (x: number, y: number, page: number) => void;
}

export function useCollaboration(projectId: string | null): UseCollaborationResult {
  const collaborators = useStore((s) => s.collaborators);
  const addCollaborator = useStore((s) => s.addCollaborator);
  const removeCollaborator = useStore((s) => s.removeCollaborator);
  const updateCollaboratorCursor = useStore((s) => s.updateCollaboratorCursor);

  const isConnectedRef = useRef(false);
  const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to SSE-derived collaboration events from ws-client activity bus
  useEffect(() => {
    if (!projectId) return;

    const unsub = subscribeToActivity((event, data) => {
      switch (event) {
        case 'viewer:joined': {
          const { viewerId, name } = data as { viewerId?: string; name?: string };
          if (viewerId) {
            addCollaborator(viewerId, name ?? `User-${viewerId.slice(0, 4)}`, nextColor());
          }
          break;
        }
        case 'viewer:left': {
          const { viewerId } = data as { viewerId?: string };
          if (viewerId) removeCollaborator(viewerId);
          break;
        }
        case 'cursor:update': {
          const { viewerId, x, y, page } = data as { viewerId?: string; x?: number; y?: number; page?: number };
          if (viewerId && typeof x === 'number' && typeof y === 'number') {
            updateCollaboratorCursor(viewerId, { x, y, page: page ?? 1 });
          }
          break;
        }
        case 'connected': {
          isConnectedRef.current = true;
          break;
        }
        default:
          break;
      }
    });

    return unsub;
  }, [projectId, addCollaborator, removeCollaborator, updateCollaboratorCursor]);

  // Evict stale collaborators (no update in 60 s)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      collaborators.forEach((c) => {
        if (now - c.lastSeen > 60_000) removeCollaborator(c.id);
      });
    }, 15_000);
    return () => clearInterval(interval);
  }, [collaborators, removeCollaborator]);

  // Throttled cursor update sender — POSTs to /api/ws is SSE (read-only),
  // so cursor updates go through a lightweight fire-and-forget POST.
  // Falls back silently if endpoint is unavailable.
  const sendCursorUpdate = useCallback((x: number, y: number, page: number) => {
    if (!projectId) return;
    if (cursorThrottleRef.current) return; // throttle to ~10 fps
    cursorThrottleRef.current = setTimeout(() => {
      cursorThrottleRef.current = null;
    }, 100);

    // Broadcast via broadcastToProject on the server requires a POST.
    // Use a fire-and-forget; ignore failures silently.
    fetch(`/api/ws/cursor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, x, y, page }),
      keepalive: true,
    }).catch(() => { /* graceful degradation */ });
  }, [projectId]);

  return { collaborators, isConnected: isConnectedRef.current, sendCursorUpdate };
}
