'use client';
import {useState} from 'react';
import {Flex, IconButton, Text} from '@radix-ui/themes';
import {Cross2Icon, ExclamationTriangleIcon} from '@radix-ui/react-icons';
import {useSiteSettings} from '../utils/api/siteSettings';

const DISMISS_KEY = 'districtr-site-banner-dismissed';

/**
 * Site-wide notice (downtime and the like) set from the CMS's Frontend
 * settings page. Shown until dismissed; dismissal remembers the text, so a
 * changed message shows again. Reads the shared site-settings poll, so long
 * editing sessions see a newly posted notice.
 *
 * In the page flow by default, pushing content down. `overlay` pins it over
 * the top instead, for full-viewport pages (the map editor) where an extra
 * row would make the page scroll.
 */
export const SiteBanner = ({overlay = false}: {overlay?: boolean}) => {
  const message = useSiteSettings()?.banner_message;
  // Read up front, not in an effect: after a client navigation the shared
  // message is already there on first render, so an effect would flash it.
  // Safe for hydration: the store reports null until hydration finishes.
  const [dismissed, setDismissed] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : localStorage.getItem(DISMISS_KEY)
  );

  if (!message || message === dismissed) return null;

  return (
    <div
      // Polite: announced once without interrupting, unlike role="alert".
      role="status"
      className={`border-b-2 border-amber-600 bg-amber-400 text-black ${
        // Above the editor's z-10000 layers (mobile data panel, save pill),
        // below the full-screen loading overlays (z-100000).
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
