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

/** The map routes a pasted link may point at: /map or /coi, then an optional
 * id segment, then an optional /edit or /eval. */
const MAP_PATH = /^\/(?:map|coi)(?:\/([^/]+))?(?:\/(?:edit|eval))?\/?$/;

/**
 * Extract a document reference (UUID or numeric public id) from a map link or
 * bare id a user might paste: edit links, read and eval links, legacy
 * `?document_id=` links, or the id itself. Null for anything else, including
 * classic districtr `/plan/<n>` links, which would otherwise name an
 * unrelated v2 map. The host isn't checked: dev, beta and prod links all
 * name the same kind of map.
 *
 * Order: a numeric public id in the path first, then the private_edit_id
 * token, then `document_id`, then a UUID path segment. The backend resolves a
 * public id and a UUID to the same map, and a token damaged in transit can
 * still decode to a well-formed UUID for some other document, so the path id
 * is the safer source whenever the link carries one (every current edit link
 * does).
 */
export const parseMapRef = (input: string, base?: string): string | null => {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return null;
  if (isUUID(trimmed) || /^\d+$/.test(trimmed)) return trimmed;
  let url: URL;
  try {
    url = new URL(
      trimmed,
      base ?? (typeof window !== 'undefined' ? window.location.href : undefined)
    );
  } catch {
    return null;
  }
  const match = url.pathname.match(MAP_PATH);
  if (!match) return null;
  const segment = match[1] ?? '';
  if (/^\d+$/.test(segment)) return segment;
  const privateId = url.searchParams.get(PRIVATE_EDIT_ID_PARAM);
  if (privateId) {
    const uuid = expandUUID(privateId);
    if (uuid) return uuid;
  }
  const documentId = url.searchParams.get('document_id');
  if (documentId && isUUID(documentId)) return documentId;
  if (isUUID(segment)) return segment;
  return null;
};
