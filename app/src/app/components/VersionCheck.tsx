'use client';
import React, {useEffect, useState} from 'react';
import {usePathname} from 'next/navigation';
import {Dialog, Button, Text, Flex} from '@radix-ui/themes';
import {useVisibilityState} from '../hooks/useVisibilityState';
import {fetchSiteSettings, type SiteSettings} from '../utils/api/siteSettings';

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
 *
 * The same checks watch maintenance mode (site settings' under_construction):
 * while it's on, a blocking dialog covers the page — the API is answering 503,
 * so edits can't save — and it closes on the first check after it's off.
 */
export const VersionCheck: React.FC = () => {
  const [stale, setStale] = useState(false);
  const [maintenance, setMaintenance] = useState<SiteSettings | null>(null);
  const {isVisible} = useVisibilityState();
  const pathname = usePathname();

  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;

    const check = async () => {
      const [serverVersion, settings] = await Promise.all([
        CLIENT_VERSION ? fetchServerVersion() : null,
        fetchSiteSettings(),
      ]);
      if (cancelled) return;
      if (serverVersion && serverVersion !== CLIENT_VERSION) setStale(true);
      // null is a failed fetch: keep the last state.
      if (settings) setMaintenance(settings.under_construction ? settings : null);
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

  if (maintenance && pathname !== '/under-construction') {
    return (
      <Dialog.Root open>
        <Dialog.Content>
          <Dialog.Title>Districtr is down for maintenance</Dialog.Title>
          <Text size="3" className="block mb-4">
            Changes can&apos;t be saved right now. This message closes on its own once Districtr is
            back.
          </Text>
          {maintenance.banner_message && (
            <Text size="3" weight="bold" className="block whitespace-pre-line">
              {maintenance.banner_message}
            </Text>
          )}
        </Dialog.Content>
      </Dialog.Root>
    );
  }

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
