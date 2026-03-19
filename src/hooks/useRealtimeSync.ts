'use client';

import { useEffect, useRef } from 'react';
import { connectToProject, disconnectFromProject } from '@/lib/ws-client';

/**
 * useRealtimeSync — connects SSE for the given projectId.
 * Reconnects when projectId changes. Disconnects on unmount.
 */
export function useRealtimeSync(projectId: string | null) {
  const connectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    if (connectedRef.current === projectId) return;

    connectedRef.current = projectId;
    connectToProject(projectId);

    return () => {
      connectedRef.current = null;
      disconnectFromProject();
    };
  }, [projectId]);
}
