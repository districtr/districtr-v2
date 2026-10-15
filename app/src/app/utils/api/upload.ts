import Papa from 'papaparse';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {uploadAssignments} from './apiHandlers/uploadAssignments';
import {type MapType} from '@constants/document/types';
import {FIPS_TO_ABBR, FIPS_TO_NAME} from '@constants/meta/usStates';

const MAX_ROWS = 914_231;
// Generous on purpose: a max-row two-column CSV is ~25 MB, and MAX_ROWS is the real guard.
const MAX_FILE_SIZE = 100_000_000;

export type MapLink = DistrictrMap & {
  document_id: string;
  public_id?: number | null;
  filename: string;
  skipped_geo_ids?: string[];
  zone_label_remapping?: Record<string, number>;
};

type GeoidType = 'block' | 'bg' | 'vtd';

type ParsedGeoid = {
  type: GeoidType;
  normalized: string;
  stateFips: string;
};

/**
 * Classify a raw GEOID string from a CSV first column.
 *
 * Supported formats:
 *   block  — 14-15 numeric digits (census block, padded to 15)
 *   bg     — 11-12 numeric digits (census block group, padded to 12)
 *   vtd    — "vtd:" + state(2) + county(3) + alphanumeric code
 *
 * Returns null if the string matches none of these formats (e.g. a header row).
 */
const parseGeoid = (raw: string): ParsedGeoid | null => {
  if (raw.startsWith('vtd:')) {
    const inner = raw.slice(4);
    // Must have at least state(2) + county(3) + 1 code char, and state/county must be digits.
    if (inner.length >= 6 && /^\d{5}/.test(inner)) {
      return {type: 'vtd', normalized: raw, stateFips: inner.slice(0, 2)};
    }
    return null;
  }

  if (!/^\d+$/.test(raw)) return null;

  if (raw.length >= 14 && raw.length <= 15) {
    const normalized = raw.padStart(15, '0');
    return {type: 'block', normalized, stateFips: normalized.slice(0, 2)};
  }

  if (raw.length >= 11 && raw.length <= 12) {
    const normalized = raw.padStart(12, '0');
    return {type: 'bg', normalized, stateFips: normalized.slice(0, 2)};
  }

  return null;
};

type PartitionResult = {
  assignments: [string, string][];
  skippedGeoIds: string[];
  stateFipsSet: Set<string>;
};

// Single pass over parsed CSV rows. Block GEOIDs proceed to upload; BG, VTD,
// and unrecognized rows are collected as skipped warnings for the user.
const partitionRows = (rows: string[][]): PartitionResult => {
  const assignments: [string, string][] = [];
  const skippedGeoIds: string[] = [];
  const stateFipsSet = new Set<string>();
  for (const row of rows) {
    const raw = `${row[0] ?? ''}`.trim();
    const parsed = parseGeoid(raw);
    if (parsed?.type === 'block') {
      assignments.push([parsed.normalized, (row[1] ?? '').trim()]);
      stateFipsSet.add(parsed.stateFips);
    } else {
      skippedGeoIds.push(raw || '[empty]');
    }
  }
  return {assignments, skippedGeoIds, stateFipsSet};
};

// CSV imports target the state's custom (modifiable-district) map by naming
// convention: every deployed environment must have a visible custom module
// for the importer to work. There is no fallback to fixed-district maps —
// their locked num_districts silently clamps uploaded plans. The v1 slug is
// accepted while environments that predate the v2 catalog remain in service.
const inferMapForCsv = (fips: string, availableMaps: DistrictrMap[]): DistrictrMap | null => {
  const abbr = FIPS_TO_ABBR[fips];
  if (!abbr) return null;
  const lower = abbr.toLowerCase();
  return (
    availableMaps.find(m => m.districtr_map_slug === `${lower}_custom_districts_v2`) ??
    availableMaps.find(m => m.districtr_map_slug === `${lower}_custom_districts`) ??
    null
  );
};

const parseCsv = (file: File) =>
  new Promise<string[][]>((resolve, reject) =>
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: results => resolve(results.data),
      error: reject,
    })
  );

/** Parse a block-assignment CSV and create a document from it. Rejects with a user-facing message. */
export const processFile = async ({
  file,
  availableMaps,
  documentMapType = 'default',
}: {
  file: File;
  availableMaps: DistrictrMap[];
  documentMapType?: MapType;
}): Promise<MapLink> => {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File is larger than the ${MAX_FILE_SIZE / 1_000_000} MB limit`);
  }

  const allRows = await parseCsv(file);

  // If row 0 is a header (col 0 is not a GEOID), evict it without copying the
  // array: swap it with the last row and pop. Row order does not matter because
  // we build a GEOID→zone map, not an ordered list.
  const row0Raw = (allRows[0]?.[0] ?? '').trim();
  if (parseGeoid(row0Raw) === null) {
    allRows[0] = allRows[allRows.length - 1];
    allRows.pop();
  }

  if (allRows.length === 0 || (allRows[0]?.length ?? 0) < 2) {
    throw new Error('Missing columns');
  }

  if (allRows.length > MAX_ROWS) {
    throw new Error(`Upload size exceeds maximum allowed limit (${MAX_ROWS} records)`);
  }

  const {assignments, skippedGeoIds, stateFipsSet} = partitionRows(allRows);

  if (stateFipsSet.size === 0) {
    throw new Error('No valid block GEOIDs found');
  }
  // UX decision: we hard-fail on mixed states rather than guessing which state
  // the user intended. A CSV from Dave's Redistricting App for a single state
  // plan should never span multiple state FIPS codes; if it does, the file is
  // likely mismatched or corrupted.
  // TODO: We might prompt users to indicate which state they intend the import for.
  if (stateFipsSet.size > 1) {
    const names = [...stateFipsSet]
      .map(f => (FIPS_TO_NAME[f] ? `${FIPS_TO_NAME[f]} (${FIPS_TO_ABBR[f]})` : `FIPS ${f}`))
      .join(', ');
    throw new Error(`Mixed states found in CSV: ${names}`);
  }

  const fips = [...stateFipsSet][0];
  const districtrMap = inferMapForCsv(fips, availableMaps);
  if (!districtrMap) {
    const stateName = FIPS_TO_NAME[fips] ?? `FIPS ${fips}`;
    throw new Error(`No custom districts map available for ${stateName}`);
  }

  const uploadResult = await uploadAssignments({
    assignments,
    districtr_map_slug: districtrMap.districtr_map_slug,
    map_type: documentMapType,
  });
  if (!uploadResult.ok) {
    throw new Error(uploadResult.error.detail);
  }
  if (!uploadResult.response?.document_id) {
    throw new Error('Unknown error encountered while uploading assignments');
  }
  const allSkipped = [...skippedGeoIds, ...(uploadResult.response.skipped_geo_ids ?? [])];
  const remapping = uploadResult.response.zone_label_remapping;
  return {
    ...districtrMap,
    document_id: uploadResult.response.document_id,
    public_id: uploadResult.response.public_id,
    filename: file.name,
    skipped_geo_ids: allSkipped.length > 0 ? allSkipped : undefined,
    zone_label_remapping: remapping && Object.keys(remapping).length > 0 ? remapping : undefined,
  };
};
