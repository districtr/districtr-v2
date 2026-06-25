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
};

const isBlockGeoid = (v: string) => v.length === 15 && !isNaN(+v);

const validateBlockGeoid = (raw: string): string | null => {
  const padded = raw.padStart(15, '0');
  if ((raw.length !== 14 && raw.length !== 15) || !isBlockGeoid(padded)) {
    return 'Invalid GEOID in first column';
  }
  return null;
};

const validateGeoidSample = (rows: string[][], expectedFips: string, n = 5): string | null => {
  const indices = new Set<number>();
  while (indices.size < Math.min(n, rows.length - 1)) {
    indices.add(1 + Math.floor(Math.random() * (rows.length - 1)));
  }
  for (const i of indices) {
    const raw = `${rows[i][0] ?? ''}`.trim();
    const err = validateBlockGeoid(raw);
    if (err) return err;
    if (raw.padStart(15, '0').slice(0, 2) !== expectedFips) return 'Mixed states in CSV';
  }
  return null;
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
      if (validateBlockGeoid(row0Raw) !== null) {
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

      const firstRowRaw = (allRows[0][0] ?? '').trim();
      const firstRowGeoidError = validateBlockGeoid(firstRowRaw);
      if (firstRowGeoidError) {
        setError({ok: false, detail: {message: firstRowGeoidError}});
        return;
      }

      const fips = firstRowRaw.padStart(15, '0').slice(0, 2);
      const districtrMap = inferCongressionalMap(fips, availableMaps);
      if (!districtrMap) {
        const stateName = FIPS_TO_NAME[fips] ?? `FIPS ${fips}`;
        setError({
          ok: false,
          detail: {message: `No congressional map found for ${stateName}`},
        });
        return;
      }

      const geoidError = validateGeoidSample(allRows, fips);
      if (geoidError) {
        setError({ok: false, detail: {message: geoidError}});
        return;
      }

      const assignments: [string, string][] = allRows.map(r => [
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
