'use client';

import {useRouter} from 'next/navigation';
import {useCallback, useEffect, useRef} from 'react';

/**
 * Client component that listens for Payload CMS live preview messages
 * and refreshes the route when the editor saves or updates content.
 *
 * This component should only be rendered when draft mode is enabled.
 *
 * NOTE: If @payloadcms/live-preview-react is installed in the future,
 * this can be replaced with `import { RefreshRouteOnSave } from '@payloadcms/live-preview-react'`.
 */
export function RefreshRouteOnSave() {
  const router = useRouter();
  const lastRefresh = useRef(Date.now());

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Payload's live preview sends messages with a specific type
      if (
        typeof event.data === 'object' &&
        event.data !== null &&
        (event.data.type === 'payload-live-preview' || event.data.type === 'payload-refresh')
      ) {
        // Throttle refreshes to avoid hammering the server
        const now = Date.now();
        if (now - lastRefresh.current > 500) {
          lastRefresh.current = now;
          router.refresh();
        }
      }
    },
    [router]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  return null;
}
