'use client';
import {useEffect, useState} from 'react';
import {Flex, IconButton, Text} from '@radix-ui/themes';
import {Cross2Icon, ExclamationTriangleIcon} from '@radix-ui/react-icons';
import {API_URL} from '../utils/api/constants';
import {useVisibilityState} from '../hooks/useVisibilityState';

const DISMISS_KEY = 'districtr-site-banner-dismissed';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Site-wide notice (downtime and the like) set from the CMS's Frontend
 * settings page. Shown until dismissed; dismissal remembers the text, so a
 * changed message shows again. Re-checks every five minutes while the tab is
 * visible so long editing sessions see a newly posted notice.
 *
 * In the page flow by default, pushing content down. `overlay` pins it over
 * the top instead, for full-viewport pages (the map editor) where an extra
 * row would make the page scroll.
 */
export const SiteBanner = ({overlay = false}: {overlay?: boolean}) => {
  const [message, setMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const {isVisible} = useVisibilityState();

  useEffect(() => setDismissed(localStorage.getItem(DISMISS_KEY)), []);

  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    const check = () =>
      fetch(`${API_URL}/api/cms/site_settings`, {cache: 'no-store'})
        .then(response => (response.ok ? response.json() : null))
        .then(settings => {
          if (!cancelled && settings) setMessage(settings.banner_message ?? null);
        })
        // Keep the last message through network blips.
        .catch(() => {});
    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isVisible]);

  if (!message || message === dismissed) return null;

  return (
    <div
      role="alert"
      className={`border-b-2 border-amber-600 bg-amber-400 text-black ${
        // Above the map Topbar (z-10000), below the full-screen loading
        // overlays (z-100000).
        overlay ? 'fixed inset-x-0 top-0 z-[20000] shadow-lg' : ''
      }`}
    >
      <Flex align="center" justify="center" gap="3" className="mx-auto max-w-screen-xl px-4 py-3">
        <ExclamationTriangleIcon className="size-6 shrink-0" aria-hidden />
        <Text size="4" weight="bold" className="whitespace-pre-line">
          {message}
        </Text>
        <IconButton
          variant="ghost"
          color="gray"
          highContrast
          aria-label="Dismiss notice"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, message);
            setDismissed(message);
          }}
        >
          <Cross2Icon />
        </IconButton>
      </Flex>
    </div>
  );
};
