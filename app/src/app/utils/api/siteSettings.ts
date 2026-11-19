import {useSyncExternalStore} from 'react';
import {API_URL} from './constants';

export type SiteSettings = {
  under_construction: boolean;
  banner_message: string | null;
  /** ISO timestamp the downtime countdown runs to; null when none is set. */
  downtime_at: string | null;
};

// Quoted in the CMS Frontend settings help text ("about a minute"). Short
// enough for a 10-minute downtime countdown to reach open tabs in time; the
// endpoint serves a per-worker snapshot, so a poll costs no DB work.
export const POLL_MS = 60 * 1000;
// Tab returns, window focus and remounts refetch at most this often, so a
// user flipping between windows doesn't hammer the API.
export const MIN_GAP_MS = 60 * 1000;

let current: SiteSettings | null = null;
let lastFetchAt = -Infinity;
const listeners = new Set<() => void>();

/**
 * GET /api/cms/site_settings into the shared snapshot, unless the last fetch
 * was under `minGapMs` ago. Any failure keeps the last good value.
 *
 * Plain fetch, not the API factory: the factory's fetchWithSession mints a
 * Turnstile session, which a public poll on every page must not do.
 */
export async function refreshSiteSettings(minGapMs = MIN_GAP_MS): Promise<void> {
  const now = Date.now();
  if (now - lastFetchAt < minGapMs) return;
  lastFetchAt = now;
  try {
    const response = await fetch(`${API_URL || ''}/api/cms/site_settings`, {cache: 'no-store'});
    if (!response.ok) return;
    current = await response.json();
    listeners.forEach(listener => listener());
  } catch {
    // Network blip: keep the last value.
  }
}

export const getSiteSettings = () => current;

function startPolling() {
  const checkIfVisible = () => {
    if (document.visibilityState === 'visible') refreshSiteSettings();
  };
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') refreshSiteSettings(0);
  }, POLL_MS);
  document.addEventListener('visibilitychange', checkIfVisible);
  // Catches clicks between side-by-side windows, which never fire
  // visibilitychange.
  window.addEventListener('focus', checkIfVisible);
  checkIfVisible();
  return () => {
    clearInterval(interval);
    document.removeEventListener('visibilitychange', checkIfVisible);
    window.removeEventListener('focus', checkIfVisible);
  };
}

let stopPolling: (() => void) | null = null;

export function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!stopPolling) stopPolling = startPolling();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stopPolling) {
      stopPolling();
      stopPolling = null;
    }
  };
}

/**
 * Site settings (banner text, maintenance flag), shared by every caller: one
 * poller per tab, on load, tab return, window focus and every minute
 * while visible. null until the first fetch succeeds.
 */
export function useSiteSettings(): SiteSettings | null {
  return useSyncExternalStore(subscribe, getSiteSettings, () => null);
}
