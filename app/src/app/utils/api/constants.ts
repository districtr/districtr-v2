export const API_URL =
  typeof window === 'undefined'
    ? (process.env.NEXT_SERVER_API_URL ?? process.env.NEXT_PUBLIC_API_URL)
    : process.env.NEXT_PUBLIC_API_URL;

export const TILESET_URL = process.env.NEXT_PUBLIC_S3_BUCKET_URL;
export const CDN_URL = TILESET_URL;

/** Matches the backend's `settings.ENVIRONMENT`, set alongside NEXT_PUBLIC_API_URL
 * per deployment. Used to scope direct CDN reads (e.g. thumbnails) so different
 * environments don't collide on the same S3 key. */
export const ENVIRONMENT = process.env.NEXT_PUBLIC_ENVIRONMENT ?? 'production';
export const GEODATA_URL =
  process.env.NEXT_PUBLIC_S3_BUCKET_URL_MIRROR1 ?? process.env.NEXT_PUBLIC_S3_BUCKET_URL;
export const PARQUET_URL =
  process.env.NEXT_PUBLIC_S3_BUCKET_URL_MIRROR2 ?? process.env.NEXT_PUBLIC_S3_BUCKET_URL;

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
export const TURNSTILE_SESSION_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SESSION_SITE_KEY ?? '';

/** MapTiler API key for basemaps (Streets/Satellite) and geocoding. */
export const MAPTILER_API_KEY = process.env.NEXT_PUBLIC_MAPTILER_API_KEY ?? '';
