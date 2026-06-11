/** Only allow same-origin relative redirect targets; anything else falls back to /admin. */
export const sanitizeReturnTo = (returnTo: unknown): string =>
  typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo
    : '/admin';
