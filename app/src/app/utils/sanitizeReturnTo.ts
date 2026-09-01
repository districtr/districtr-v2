/**
 * Only allow same-origin relative redirect targets; anything else falls back
 * to /. Rejects `//host` AND any backslash: browsers normalize `\` to `/`
 * when resolving special-scheme URLs, so `/\evil.com` is scheme-relative too.
 */
export const sanitizeReturnTo = (returnTo: unknown): string =>
  typeof returnTo === 'string' &&
  returnTo.startsWith('/') &&
  !returnTo.startsWith('//') &&
  !returnTo.includes('\\')
    ? returnTo
    : '/';
