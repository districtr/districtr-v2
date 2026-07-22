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
 * Path (+query) for a document's edit page: `/{route}/edit/{public_id}?private_edit_id=…`.
 * Falls back to the bare UUID path for documents without a public id.
 */
export const editPath = (
  routePrefix: string,
  document_id: string,
  public_id?: number | null
): string =>
  public_id != null
    ? `/${routePrefix}/edit/${public_id}?${PRIVATE_EDIT_ID_PARAM}=${shortenUUID(document_id)}`
    : `/${routePrefix}/edit/${document_id}`;
