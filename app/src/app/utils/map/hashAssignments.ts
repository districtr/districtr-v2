import {NullableZone} from '@constants/map/zone';

/**
 * SHA-256 (hex) of a plan, for checking a save without downloading it. Must match
 * the backend's `assignments_count_and_hash`: entries sorted by geo_id, each
 * `geo_id:zone` (empty zone when unassigned), joined by newlines, UTF-8.
 * geo_ids are ASCII, so JS code-unit order equals Postgres's byte order.
 * Null where WebCrypto is unavailable (an http:// origin other than localhost).
 */
export const hashAssignments = async (
  assignments: Map<string, NullableZone>
): Promise<string | null> => {
  if (!globalThis.crypto?.subtle) return null;
  const entries = Array.from(assignments);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const text = entries.map(([geoId, zone]) => `${geoId}:${zone ?? ''}`).join('\n');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
};
