'use client';
import React from 'react';
import Papa from 'papaparse';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {uploadAssignments} from './apiHandlers/uploadAssignments';
import {useMapStore} from '@/app/store/mapStore';
import {type MapType} from '@constants/document/types';
import {FIPS_TO_ABBR, FIPS_TO_NAME} from '@constants/meta/usStates';

const MAX_ROWS = 914_231;
const MAX_FILE_SIZE = 2_000_000_000; // 20mb

export type MapLink = DistrictrMap & {
  document_id: string;
  filename: string;
  skipped_geo_ids?: string[];
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
  blockRows: string[][];
  skippedGeoIds: string[];
  stateFipsSet: Set<string>;
};

// Single pass over parsed CSV rows. Block GEOIDs proceed to upload; BG, VTD,
// and unrecognized rows are collected as skipped warnings for the user.
const partitionRows = (rows: string[][]): PartitionResult => {
  const blockRows: string[][] = [];
  const skippedGeoIds: string[] = [];
  const stateFipsSet = new Set<string>();
  for (const row of rows) {
    const raw = `${row[0] ?? ''}`.trim();
    const parsed = parseGeoid(raw);
    if (parsed?.type === 'block') {
      blockRows.push(row);
      stateFipsSet.add(parsed.stateFips);
    } else {
      skippedGeoIds.push(raw || '[empty]');
    }
  }
  return {blockRows, skippedGeoIds, stateFipsSet};
};

// Slug patterns must stay in sync with how maps are named in the DB
// A mismatch will silently break CSV import for that state.
const inferCongressionalMap = (
  fips: string,
  availableMaps: DistrictrMap[]
): DistrictrMap | null => {
  const abbr = FIPS_TO_ABBR[fips];
  if (!abbr) return null;
  const lower = abbr.toLowerCase();
  // Prefer the canonical congressional slug, then name-matching, then state senate
  // as a fallback for at-large states (AK, DE, ND, SD, WY) that have no congressional map.
  return (
    availableMaps.find(m => m.districtr_map_slug === `${lower}_congressional_districts`) ??
    availableMaps.find(
      m =>
        m.districtr_map_slug.startsWith(`${lower}_`) &&
        m.name.toLowerCase().includes('congressional')
    ) ??
    availableMaps.find(m => m.districtr_map_slug === `${lower}_state_senate_districts`) ??
    null
  );
};

export const processFile = ({
  file,
  setMapLinks,
  setError,
  availableMaps,
  documentMapType = 'default',
}: {
  file: File;
  setMapLinks: React.Dispatch<React.SetStateAction<MapLink[]>>;
  setError: React.Dispatch<React.SetStateAction<any>>;
  availableMaps: DistrictrMap[];
  documentMapType?: MapType;
}) => {
  const {setErrorNotification} = useMapStore.getState();

  if (!file) {
    setErrorNotification({message: 'No file selected', severity: 1});
    throw new Error('No file selected');
  }
  if (file.size > MAX_FILE_SIZE) {
    setErrorNotification({message: 'Block CSV file size exceeds limit (20mb)', severity: 1});
    throw new Error('Block CSV file size exceeds limit');
  }

  Papa.parse(file, {
    skipEmptyLines: true,
    complete: async results => {
      const allRows = results.data as string[][];

      // If row 0 is a header (col 0 is not a GEOID), evict it without copying the
      // array: swap it with the last row and pop. Row order does not matter because
      // we build a GEOID→zone map, not an ordered list.
      const row0Raw = (allRows[0]?.[0] ?? '').trim();
      if (parseGeoid(row0Raw) === null) {
        allRows[0] = allRows[allRows.length - 1];
        allRows.pop();
      }

      if (allRows.length === 0 || (allRows[0]?.length ?? 0) < 2) {
        setError({ok: false, detail: {message: 'Missing columns'}});
        return;
      }

      if (allRows.length > MAX_ROWS) {
        setError({
          ok: false,
          detail: {message: `Upload size exceeds maximum allowed limit (${MAX_ROWS} records)`},
        });
        return;
      }

      const {blockRows, skippedGeoIds, stateFipsSet} = partitionRows(allRows);

      if (stateFipsSet.size === 0) {
        setError({ok: false, detail: {message: 'No valid block GEOIDs found'}});
        return;
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
        setError({ok: false, detail: {message: `Mixed states found in CSV: ${names}`}});
        return;
      }

      const fips = [...stateFipsSet][0];
      const districtrMap = inferCongressionalMap(fips, availableMaps);
      if (!districtrMap) {
        const stateName = FIPS_TO_NAME[fips] ?? `FIPS ${fips}`;
        setError({
          ok: false,
          detail: {message: `No congressional map found for ${stateName}`},
        });
        return;
      }

      const assignments: [string, string][] = blockRows.map(r => [
        (r[0] ?? '').padStart(15, '0'),
        (r[1] ?? '').trim(),
      ]);

      try {
        const uploadResult = await uploadAssignments({
          assignments,
          districtr_map_slug: districtrMap.districtr_map_slug,
          map_type: documentMapType,
        });
        if (uploadResult.ok && uploadResult.response?.document_id) {
          const allSkipped = [...skippedGeoIds, ...(uploadResult.response.skipped_geo_ids ?? [])];
          setMapLinks(prev => [
            ...prev,
            {
              ...districtrMap,
              document_id: uploadResult.response.document_id,
              filename: file.name,
              skipped_geo_ids: allSkipped.length > 0 ? allSkipped : undefined,
            },
          ]);
        } else {
          setError({
            ok: false,
            detail: {
              message: uploadResult.ok
                ? 'Unknown error encountered while uploading assignments'
                : uploadResult.error.detail,
            },
          });
        }
      } catch (error: unknown) {
        setError({
          ok: false,
          detail: {
            message:
              error instanceof Error
                ? error.message
                : 'Unknown error encountered after uploading assignments',
          },
        });
      }
    },
  });
};
