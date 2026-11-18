import {API_URL} from './constants';

export type SiteSettings = {under_construction: boolean; banner_message: string | null};

const SHARE_MS = 5_000;
let last: {at: number; settings: Promise<SiteSettings | null>} | null = null;

/**
 * GET /api/cms/site_settings, or null on any failure (callers keep their last
 * value through network blips). SiteBanner and VersionCheck poll on the same
 * mount/visibility/interval beats, so calls within a few seconds share one
 * request.
 */
export function fetchSiteSettings(): Promise<SiteSettings | null> {
  if (!last || Date.now() - last.at > SHARE_MS) {
    last = {
      at: Date.now(),
      settings: fetch(`${API_URL}/api/cms/site_settings`, {cache: 'no-store'})
        .then(response => (response.ok ? response.json() : null))
        .catch(() => null),
    };
  }
  return last.settings;
}
