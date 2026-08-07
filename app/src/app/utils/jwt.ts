/**
 * Claims we read from CMS-issued access tokens. Signature verification happens
 * server-side in the FastAPI backend / CMS; here we only need the claims.
 */
export interface JwtPayload {
  sub?: string;
  email?: string;
  name?: string;
  roles?: string[];
  /** Space-delimited scope claim from the access token. */
  scope?: string;
  exp?: number;
}

/**
 * Decode a JWT payload without verifying the signature. Base64url-safe and
 * UTF-8 correct; works in both server and client bundles (atob + TextDecoder
 * are global in Node 18+, edge, and browsers).
 */
export const decodeJwtPayload = (token: string): JwtPayload | null => {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    console.error('Failed to decode JWT payload', error);
    return null;
  }
};
