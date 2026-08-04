import {useSyncExternalStore} from 'react';

// Matches Tailwind's `lg` breakpoint, which gates the desktop sidebar.
const QUERY = '(min-width: 1024px)';

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};

/**
 * True at desktop widths (Tailwind lg+). A JS gate — not just CSS — so
 * components with document-level listeners (the Toolbar subtree) mount
 * exactly once: in the sidebar on desktop, in the mobile dock below lg.
 */
export const useIsDesktop = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    // SSR: assume desktop; phones correct themselves after hydration.
    () => true
  );
