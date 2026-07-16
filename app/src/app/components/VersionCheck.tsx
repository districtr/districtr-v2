'use client';
import React, {useEffect, useState} from 'react';
import {Dialog, Button, Text, Flex} from '@radix-ui/themes';
import {useVisibilityState} from '../hooks/useVisibilityState';

// Inlined into the client bundle at build time from .env.production (the git
// SHA stamped by the deploy workflow). The /api/version route reports the
// running server's value, so a mismatch means this tab loaded its bundle
// before the latest deploy. Undefined in local dev, which disables the check.
const CLIENT_VERSION = process.env.NEXT_PUBLIC_BUILD_TAG;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function fetchServerVersion(): Promise<string | null> {
  try {
    const response = await fetch('/api/version', {cache: 'no-store'});
    if (!response.ok) return null;
    const data = await response.json();
    return data.version ?? null;
  } catch {
    // Transient network failures are not evidence of staleness.
    return null;
  }
}

/**
 * Detects when the deployed frontend is newer than the bundle this tab is
 * running, and blocks further interaction until the user reloads. Stale tabs
 * are not hypothetical here: editing sessions are long-lived, and a stale
 * client can speak an outdated API contract (e.g. JSON vs msgpack saves).
 *
 * Checks on mount, when the tab becomes visible again, on window focus
 * (catches clicks between side-by-side windows, which never fire
 * visibilitychange), and on an interval. Polling pauses while the tab is
 * hidden.
 * The dialog intentionally has no dismiss affordance — onOpenChange is not
 * wired, so ESC and backdrop clicks are no-ops and reloading is the only way
 * forward.
 */
export const VersionCheck: React.FC = () => {
  const [stale, setStale] = useState(false);
  const {isVisible} = useVisibilityState();

  useEffect(() => {
    if (!CLIENT_VERSION || !isVisible) return;
    let cancelled = false;

    const check = async () => {
      const serverVersion = await fetchServerVersion();
      if (!cancelled && serverVersion && serverVersion !== CLIENT_VERSION) {
        setStale(true);
      }
    };

    // Effect re-runs each time the tab becomes visible, so this covers both
    // initial mount and returning to the tab.
    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    window.addEventListener('focus', check);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', check);
    };
  }, [isVisible]);

  if (!stale) return null;

  return (
    <Dialog.Root open>
      <Dialog.Content>
        <Dialog.Title>Districtr has been updated</Dialog.Title>
        <Text size="3" className="block mb-4">
          A new version of Districtr was released after this page loaded. Please reload the page to
          keep working — your saved work will be right where you left it.
        </Text>
        <Flex justify="end">
          <Button size="3" onClick={() => window.location.reload()}>
            Reload now
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
