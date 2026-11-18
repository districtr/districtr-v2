'use client';
import {useEffect, useReducer, useState} from 'react';
import {Flex, IconButton, Text} from '@radix-ui/themes';
import {Cross2Icon, ExclamationTriangleIcon} from '@radix-ui/react-icons';
import {useSiteSettings} from '../utils/api/siteSettings';

const DISMISS_KEY = 'districtr-site-banner-dismissed';

/** "in 10 minutes" for a downtime `ms` away; rounds up, so it never undersells. */
export function downtimeIn(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 0) return 'any moment now';
  if (minutes === 1) return 'in about a minute';
  return `in ${minutes} minutes`;
}

/**
 * Site-wide notice (downtime and the like) set from the CMS's Frontend
 * settings page: the banner text, plus a live countdown when a downtime is
 * scheduled. Shown until dismissed; dismissal remembers the text and the
 * downtime, so a changed message or a new countdown shows again. Reads the
 * shared site-settings poll, so long editing sessions see a newly posted
 * notice.
 *
 * In the page flow by default, pushing content down. `overlay` pins it over
 * the top instead, for full-viewport pages (the map editor) where an extra
 * row would make the page scroll.
 */
export const SiteBanner = ({overlay = false}: {overlay?: boolean}) => {
  const settings = useSiteSettings();
  const message = settings?.banner_message;
  const downtimeAt = settings?.downtime_at;
  // Read up front, not in an effect: after a client navigation the shared
  // message is already there on first render, so an effect would flash it.
  // Safe for hydration: the store reports null until hydration finishes.
  const [dismissed, setDismissed] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : localStorage.getItem(DISMISS_KEY)
  );
  // Re-render while counting down; the render reads the clock.
  // ponytail: trusts the visitor's clock; a few minutes' skew shifts the count.
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!downtimeAt) return;
    const interval = setInterval(tick, 10_000);
    return () => clearInterval(interval);
  }, [downtimeAt]);

  const key = `${downtimeAt ?? ''}|${message ?? ''}`;
  if ((!message && !downtimeAt) || key === dismissed) return null;

  return (
    <div
      // Polite: announced without interrupting, unlike role="alert".
      role="status"
      className={`border-b-2 border-amber-600 bg-amber-400 text-black ${
        // Above the editor's z-10000 layers (mobile data panel, save pill),
        // below the full-screen loading overlays (z-100000).
        overlay ? 'fixed inset-x-0 top-0 z-[20000] shadow-lg' : ''
      }`}
    >
      <Flex align="center" justify="center" gap="3" className="mx-auto max-w-screen-xl px-4 py-3">
        <ExclamationTriangleIcon className="size-6 shrink-0" aria-hidden />
        <Flex direction="column" gap="1">
          {downtimeAt && (
            <Text size="4" weight="bold">
              Districtr will be down for scheduled maintenance{' '}
              {downtimeIn(Date.parse(downtimeAt) - Date.now())}. Please finish up what you&apos;re
              doing.
            </Text>
          )}
          {message && (
            <Text size="4" weight={downtimeAt ? 'regular' : 'bold'} className="whitespace-pre-line">
              {message}
            </Text>
          )}
        </Flex>
        <IconButton
          variant="ghost"
          color="gray"
          highContrast
          aria-label="Dismiss notice"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, key);
            setDismissed(key);
          }}
        >
          <Cross2Icon />
        </IconButton>
      </Flex>
    </div>
  );
};
