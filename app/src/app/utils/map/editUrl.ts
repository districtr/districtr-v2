import {isUUID} from '../metadata/isUUID';

/**
 * Edit URLs show the public id in the path and carry the editable document UUID —
 * the "anyone with this can edit" capability — in a query param, compressed to a
 * 22-char base64url token so the user-facing URL stays short. Treat the param
 * like a password.
 */
export const PRIVATE_EDIT_ID_PARAM = 'private_edit_id';

/** 36-char UUID → 22-char base64url token. */
export const shortenUUID = (uuid: string): string => {
  const bytes = uuid
    .replace(/-/g, '')
    .match(/.{2}/g)!
    .map(b => parseInt(b, 16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

/** Inverse of shortenUUID. Also accepts a raw UUID. Null if unparseable. */
export const expandUUID = (token: string): string | null => {
  if (isUUID(token)) return token;
  try {
    const bin = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
    if (bin.length !== 16) return null;
    const hex = Array.from(bin, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return isUUID(uuid) ? uuid : null;
  } catch {
    return null;
  }
};

/**
 * Path (+query) for a document's edit page: `/{route}/{public_id}/edit?private_edit_id=…`.
 * Falls back to the bare UUID path for documents without a public id.
 */
export const editPath = (
  routePrefix: string,
  document_id: string,
  public_id: number | null
): string =>
  public_id != null
    ? `/${routePrefix}/${public_id}/edit?${PRIVATE_EDIT_ID_PARAM}=${shortenUUID(document_id)}`
    : `/${routePrefix}/${document_id}/edit`;

/**
 * Path for a document's eval page: `/{route}/{public_id}/eval`. Eval is
 * always a read-only display of a shared map, so unlike editPath there's no
 * private-id query param and no bare-UUID fallback — public_id is required.
 */
export const evalPath = (routePrefix: string, public_id: number): string =>
  `/${routePrefix}/${public_id}/eval`;

/**
 * Path for a document's plain public view page: `/{route}/{public_id}`.
 * Read-only like evalPath, but without eval mode's comparison/scoring UI —
 * public_id is required, same as evalPath.
 */
export const viewPath = (routePrefix: string, public_id: number): string =>
  `/${routePrefix}/${public_id}`;

const TRAILING_ROUTE_SEGMENTS = new Set(['edit', 'eval']);

/**
 * Extracts the id (public id or UUID) from a pasted or generated map share
 * URL. Reads only the path portion, so any query string
 * (`?private_edit_id=…`, `?pw=true`) is naturally ignored. Handles both the
 * current `/{route}/{id}/edit|eval` shape and the legacy `/{route}/edit/{id}`
 * shape, where the id sits in different positions relative to the route
 * word. Falls back to treating unparseable input (e.g. a bare id with no
 * scheme) as a path directly, rather than rejecting it.
 */
export const parseDocumentIdFromMapUrl = (url: string): string | null => {
  const raw = url.trim();
  if (!raw) return null;
  let pathname: string;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    pathname = raw.split('?')[0];
  }
  const segments = pathname.split('/').filter(Boolean);
  if (!segments.length) return null;
  const last = segments[segments.length - 1];
  if (TRAILING_ROUTE_SEGMENTS.has(last) && segments.length > 1) {
    return segments[segments.length - 2];
  }
  return last;
};
