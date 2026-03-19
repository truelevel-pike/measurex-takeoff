'use client';

import { useEffect, useState } from 'react';
import { subscribeToActivity } from '@/lib/ws-client';

export function useViewerPresence(projectId: string | undefined, isShared: boolean) {
  const [viewerCount, setViewerCount] = useState(1);

  useEffect(() => {
    if (!projectId || !isShared) {
      setViewerCount(1);
      return;
    }

    const unsubscribe = subscribeToActivity((event: string, data: Record<string, unknown>) => {
      if (
        event === 'viewer:joined' ||
        event === 'viewer:left' ||
        event === 'viewer:count'
      ) {
        const count = data.viewerCount as number;
        if (typeof count === 'number' && count >= 0) {
          setViewerCount(count);
        }
      }
    });

    return unsubscribe;
  }, [projectId, isShared]);

  return { viewerCount };
}
