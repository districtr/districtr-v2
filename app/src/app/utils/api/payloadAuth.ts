/**
 * Utilities for getting the Payload CMS JWT token on the client side.
 * Payload stores the JWT in a cookie named "payload-token".
 */

const PAYLOAD_TOKEN_COOKIE = 'payload-token';

/**
 * Get the Payload JWT token from cookies (client-side only).
 */
export function getPayloadToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${PAYLOAD_TOKEN_COOKIE}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Build a session-like object compatible with the existing API factory.
 * This allows Payload auth to be used alongside Auth0 during the transition.
 */
export function getPayloadSession(): { tokenSet: { accessToken: string } } | null {
  const token = getPayloadToken();
  if (!token) return null;
  return { tokenSet: { accessToken: token } };
}
