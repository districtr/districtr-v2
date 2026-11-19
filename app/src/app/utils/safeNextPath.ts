/**
 * A same-site path to send the visitor on to, or '/'. Rejects anything a
 * browser would read as another origin ('//host', '/\host', 'https:', or
 * '/<tab>/host', since browsers strip tabs and newlines from URLs), and
 * /under-construction itself so "Try again" can't loop.
 */
export function safeNextPath(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/')) return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x20]/.test(next)) return '/';
  if (next[1] === '/' || next[1] === '\\') return '/';
  if (next === '/under-construction' || next.startsWith('/under-construction?')) return '/';
  return next;
}
