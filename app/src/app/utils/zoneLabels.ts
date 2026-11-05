import {MAX_COMMUNITY_NAME_LENGTH, sanitizeCommunityName} from './sanitize';

/** Stored district labels, keyed by district number: {"3": "North Shore"}. */
export type ZoneAliases = Record<string, string> | null | undefined;

/**
 * What users see for a district: its stored label, or its number as the default
 * label. The internal number is otherwise never shown.
 */
export const zoneLabel = (zone: number, aliases: ZoneAliases) => aliases?.[zone] ?? String(zone);

/** A district's name in a heading: its label, or "District 3" for a default one. */
export const districtHeading = (zone: number, aliases: ZoneAliases) =>
  aliases?.[zone] ?? `District ${zone}`;

/**
 * The label as it would be stored: the server's sanitizer and 40-character cap,
 * cut by code point like the server (a UTF-16 slice can split an emoji, and the
 * lone surrogate would fail every later save).
 */
export const cleanZoneLabel = (raw: string) =>
  Array.from(sanitizeCommunityName(raw)).slice(0, MAX_COMMUNITY_NAME_LENGTH).join('');

/** Labels compare case-insensitively; the server's twin uses str.lower(). */
const labelKey = (label: string) => label.toLowerCase();

/**
 * The district (other than `zone`) that would share `zone`'s label if it were
 * `label` (already cleaned; blank means the default, its number), or null.
 */
export const findLabelConflict = (
  zone: number,
  label: string,
  aliases: ZoneAliases,
  numDistricts: number
): number | null => {
  const key = labelKey(label || String(zone));
  for (let other = 1; other <= numDistricts; other++) {
    if (other !== zone && labelKey(zoneLabel(other, aliases)) === key) return other;
  }
  return null;
};

/** Stored labels for districts 1..numDistricts only. */
export const aliasesWithin = (aliases: ZoneAliases, numDistricts: number) =>
  Object.fromEntries(
    Object.entries(aliases ?? {}).filter(([zone]) => {
      const n = Number(zone);
      return Number.isInteger(n) && n >= 1 && n <= numDistricts;
    })
  );

/**
 * Labels after the district count changes: labels past the count are dropped,
 * and a new district whose default label (its number) another district already
 * uses gets the smallest unused number as its label instead, so labels stay
 * unique without blocking the change.
 */
export const aliasesForCount = (aliases: ZoneAliases, prevCount: number, numDistricts: number) => {
  const next: Record<string, string> = aliasesWithin(aliases, numDistricts);
  for (let zone = prevCount + 1; zone <= numDistricts; zone++) {
    if (findLabelConflict(zone, '', next, numDistricts) === null) continue;
    let candidate = 1;
    while (findLabelConflict(zone, String(candidate), next, numDistricts) !== null) candidate++;
    next[zone] = String(candidate);
  }
  return next;
};

/**
 * District numbers in panel order. The stored order is cleaned on read: numbers
 * outside 1..numDistricts and repeats are dropped, and missing districts are
 * appended in numeric order, so a changed district count just works.
 */
export const normalizeZoneOrder = (
  order: readonly number[] | null | undefined,
  numDistricts: number
) => {
  const seen = new Set<number>();
  const zones: number[] = [];
  for (const zone of order ?? []) {
    if (Number.isInteger(zone) && zone >= 1 && zone <= numDistricts && !seen.has(zone)) {
      seen.add(zone);
      zones.push(zone);
    }
  }
  for (let zone = 1; zone <= numDistricts; zone++) {
    if (!seen.has(zone)) zones.push(zone);
  }
  return zones;
};

/**
 * A color scheme (indexed by district number - 1) that gives the panel's rows
 * `colors` in order: the first row gets the first color. Slots past the order
 * keep their own color.
 */
export const colorsInZoneOrder = (colors: readonly string[], order: readonly number[]) => {
  const scheme = [...colors];
  order.forEach((zone, i) => (scheme[zone - 1] = colors[i]));
  return scheme;
};

/** `order` with `zone` moved to the position `target` holds now (a list reorder). */
export const moveZoneInOrder = (order: readonly number[], zone: number, target: number) => {
  const from = order.indexOf(zone);
  const to = order.indexOf(target);
  if (from === -1 || to === -1 || from === to) return [...order];
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, zone);
  return next;
};

/** Sort comparator for rows by a district's place in the panel order. */
export const byZoneOrder = (order: readonly number[]) => {
  const position = new Map(order.map((zone, i) => [zone, i]));
  return (a: number, b: number) =>
    (position.get(a) ?? Number.MAX_SAFE_INTEGER) - (position.get(b) ?? Number.MAX_SAFE_INTEGER) ||
    a - b;
};

/** Labels made only of ASCII digits double as number-key shortcuts. */
export const isDigitLabel = (label: string) => /^[0-9]+$/.test(label);

/** A plan's districts in panel order, with their labels and color-scheme
 * indexes (zone - 1), for district pickers. */
export const orderedZoneLabels = (
  mapDocument:
    | {
        num_districts?: number | null;
        map_metadata?: {zone_aliases?: ZoneAliases; zone_order?: number[] | null} | null;
      }
    | null
    | undefined
) =>
  normalizeZoneOrder(mapDocument?.map_metadata?.zone_order, mapDocument?.num_districts ?? 0).map(
    zone => ({
      zone,
      index: zone - 1,
      label: zoneLabel(zone, mapDocument?.map_metadata?.zone_aliases),
    })
  );
