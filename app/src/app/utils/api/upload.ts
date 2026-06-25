'use client';
import React from 'react';
import Papa from 'papaparse';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {uploadAssignments} from './apiHandlers/uploadAssignments';
import {useMapStore} from '@/app/store/mapStore';
import {type MapType} from '@constants/document/types';
import {US_STATE_META} from '@constants/meta/usStates';

const MAX_ROWS = 914_231;
const MAX_FILE_SIZE = 2_000_000_000; // 20mb

export type MapLink = DistrictrMap & {
  document_id: string;
  filename: string;
};

const FIPS_TO_ABBR = Object.fromEntries(US_STATE_META.map(s => [s.FIPS, s.ABBR]));
const FIPS_TO_NAME = Object.fromEntries(US_STATE_META.map(s => [s.FIPS, s.NAME]));

const isGeoid = (v: string) => v.length === 15 && !isNaN(+v);

// Returns true for positive whole numbers without leading zeros (e.g. "2", "2.0") but
// not for "01" (leading zero) or "1.5" (non-integer), matching the zone remapping rules.
const isWholePosNumber = (v: string): boolean => {
  const s = v.trim();
  if (!s || s[0] === '0') return false;
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 && Number.isInteger(n);
};

const inferCongressionalMap = (
  fips: string,
  availableMaps: DistrictrMap[]
): DistrictrMap | null => {
  const abbr = FIPS_TO_ABBR[fips];
  if (!abbr) return null;
  const prefix = abbr.toLowerCase() + '_';
  return (
    availableMaps.find(
      m => m.districtr_map_slug.startsWith(prefix) && m.name.toLowerCase().includes('congressional')
    ) ?? null
  );
};

const buildZoneMapping = (
  rawZones: string[],
  numDistricts: number | null
): {mapping: Map<string, number>; error?: string} => {
  const unique = [...new Set(rawZones)];
  const numericMap = new Map<string, number>();
  const stringLabels: string[] = [];

  for (const raw of unique) {
    if (isWholePosNumber(raw)) {
      numericMap.set(raw, Math.round(parseFloat(raw)));
    } else {
      stringLabels.push(raw);
    }
  }

  const usedIds = new Set(numericMap.values());
  const totalZones = usedIds.size + stringLabels.length;

  if (numDistricts !== null && totalZones > numDistricts) {
    return {
      mapping: new Map(),
      error: `Too many zones: CSV contains ${totalZones} distinct zones but the map only has ${numDistricts} districts`,
    };
  }

  // Assign string labels to unused integer slots
  const available: number[] = [];
  const cap = numDistricts ?? totalZones;
  for (let i = 1; i <= cap && available.length < stringLabels.length; i++) {
    if (!usedIds.has(i)) available.push(i);
  }

  const mapping = new Map<string, number>(numericMap);
  stringLabels.forEach((label, i) => mapping.set(label, available[i]));
  return {mapping};
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
    complete: async results => {
      let rows = results.data as string[][];

      // Skip header row if col 0 doesn't look like a GEOID
      if (rows.length > 0) {
        const firstCell = `${rows[0][0] ?? ''}`.padStart(15, '0');
        if (!isGeoid(firstCell)) {
          rows = rows.slice(1);
        }
      }

      if (rows.length === 0 || (rows[0]?.length ?? 0) < 2) {
        setError({ok: false, detail: {message: 'Missing columns'}});
        return;
      }

      if (rows.length > MAX_ROWS) {
        setError({
          ok: false,
          detail: {message: `Upload size exceeds maximum allowed limit (${MAX_ROWS} records)`},
        });
        return;
      }

      // Validate first data row col 0 is a GEOID
      const sampleGeoid = `${rows[0][0] ?? ''}`.padStart(15, '0');
      if (!isGeoid(sampleGeoid)) {
        setError({ok: false, detail: {message: 'First column is not a GEOID'}});
        return;
      }

      // Check for mixed states
      const fipsSet = new Set(
        rows.filter(r => r[0]).map(r => `${r[0]}`.padStart(15, '0').slice(0, 2))
      );
      if (fipsSet.size > 1) {
        setError({ok: false, detail: {message: 'Mixed states in CSV'}});
        return;
      }

      const fips = [...fipsSet][0];
      const districtrMap = inferCongressionalMap(fips, availableMaps);
      if (!districtrMap) {
        const stateName = FIPS_TO_NAME[fips] ?? `FIPS ${fips}`;
        setError({
          ok: false,
          detail: {message: `No congressional map found for ${stateName}`},
        });
        return;
      }

      // Build zone mapping (skip empty/null zones)
      const rawZones = rows.map(r => (r[1] ?? '').trim()).filter(v => v);
      const {mapping: zoneMapping, error: zoneError} = buildZoneMapping(
        rawZones,
        districtrMap.num_districts
      );
      if (zoneError) {
        setError({ok: false, detail: {message: zoneError}});
        return;
      }

      const assignments: [string, string][] = rows.map(r => {
        const geoid = `${r[0] ?? ''}`.padStart(15, '0');
        const raw = (r[1] ?? '').trim();
        const zone = raw ? String(zoneMapping.get(raw) ?? '') : '';
        return [geoid, zone] as [string, string];
      });

      try {
        const uploadResult = await uploadAssignments({
          assignments,
          districtr_map_slug: districtrMap.districtr_map_slug,
          map_type: documentMapType,
        });
        if (uploadResult.ok && uploadResult.response?.document_id) {
          setMapLinks(prev => [
            ...prev,
            {...districtrMap, document_id: uploadResult.response.document_id, filename: file.name},
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
