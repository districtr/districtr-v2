'use client';
import React from 'react';
import Papa from 'papaparse';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {uploadAssignments} from './apiHandlers/uploadAssignments';
import {useMapStore} from '@/app/store/mapStore';
import {AxiosError} from 'axios';

const MAX_ROWS = 914_231;
const ROWS_TO_TEST = 200;
const MAX_FILE_SIZE = 2_000_000_000; // 20mb

export type MapLink = DistrictrMap & {
  document_id: string;
  filename: string;
};

const getRowTests = (map: DistrictrMap) => [
  {
    name: 'GEOID',
    test: (value: string | number) => {
      return (
        (typeof value === 'string' &&
          (value.length === 15 || value.length === 14) &&
          !isNaN(+value)) ||
        (typeof value === 'number' && (String(value).length === 15 || String(value).length === 14))
      );
    },
    strict: true,
  },
  {
    name: 'ZONE',
    test: (value: string | number | null) => {
      return !value || (!isNaN(+value) && +value > 0 && +value <= (map.num_districts ?? 4));
    },
  },
];

const validateRows = (rows: Array<Array<string>>, plan: DistrictrMap) => {
  const tests = getRowTests(plan);
  const headerRow = rows[0];
  const candidateIndices: Record<string, Record<number, number>> = {};
  // skip header row
  const rowstoTest = rows.slice(1, ROWS_TO_TEST);
  rowstoTest.forEach((row, i) => {
    row.forEach((value, j) => {
      tests.forEach(test => {
        if (!candidateIndices[test.name]) {
          candidateIndices[test.name] = {};
        }
        if (test.test(value)) {
          candidateIndices[test.name][j] = (candidateIndices[test.name][j] ?? 0) + 1;
        }
      });
    });
  });

  const columnsAreAmbiguous = Object.values(candidateIndices).some(key => {
    const values = Object.values(key);
    const max = Math.max(...values);
    return values.filter(v => v === max).length > 1;
  });

  if (columnsAreAmbiguous) {
    return {
      ok: false,
      detail: {
        message: 'Columns are ambiguous',
        possibleIndices: candidateIndices as {
          GEOID: Record<number, number>;
          ZONE: Record<number, number>;
        },
        headerRow,
      },
    };
  }

  const mostLikelyColumns: Record<string, number> = {};
  const candidateIndicesKeys = Object.keys(candidateIndices);
  const missingColumns = [];
  for (let i = 0; i < candidateIndicesKeys.length; i++) {
    const key = candidateIndicesKeys[i];
    const candidateFields = candidateIndices[key];
    const max = Math.max(...Object.values(candidateFields));
    const maxIndex = Object.keys(candidateFields)?.find(key => candidateFields[+key] === max);
    if (!maxIndex) {
      missingColumns.push(key);
    } else {
      mostLikelyColumns[key] = +maxIndex;
    }
  }
  if (missingColumns.length) {
    return {
      ok: false,
      detail: {
        possibleIndices: candidateIndices as {
          GEOID: Record<number, number>;
          ZONE: Record<number, number>;
        },
        message: 'Missing columns',
        missingColumns,
        headerRow,
      },
    };
  }

  return {
    ok: true,
    colIndices: mostLikelyColumns as {GEOID: number; ZONE: number},
  };
};

export const processFile = ({
  file,
  setMapLinks,
  setError,
  districtrMap,
  config,
}: {
  file: File;
  setMapLinks: React.Dispatch<React.SetStateAction<MapLink[]>>;
  setError: React.Dispatch<React.SetStateAction<any>>;
  districtrMap: DistrictrMap;
  config?: {
    ZONE: number;
    GEOID: number;
  };
}) => {
  const {setErrorNotification, userID} = useMapStore.getState();
  if (!file) {
    setErrorNotification({
      message: 'No file selected',
      severity: 1,
    });
    throw new Error('No file selected');
  }
  if (file.size > MAX_FILE_SIZE) {
    setErrorNotification({
      message: 'Block CSV file size exceeds limit (20mb)',
      severity: 1,
    });
    throw new Error('Block CSV file size exceeds limit');
  }

  Papa.parse(file, {
    complete: async results => {
      const validation = config
        ? {ok: true, colIndices: config}
        : validateRows(results.data as Array<Array<string>>, districtrMap);
      if (!validation.ok || !validation.colIndices) {
        setError(validation);
        return validation;
      }

      const {GEOID, ZONE} = validation.colIndices;
      let result: {document_id: string} | undefined;
      let geoidHandler = (geoid: string | number) => `${geoid}`.padStart(15, '0');

      // All rows without the header
      const rows = results.data.slice(1) as string[][];

      if (rows.length > MAX_ROWS) {
        setError({
          ok: false,
          detail: {message: `Cannot upload more than ${MAX_ROWS} rows at once`},
        });
      }

      try {
        result = await uploadAssignments({
          assignments: rows.map(row => [
            geoidHandler(row[GEOID]),
            !row[ZONE] ? '' : String(+row[ZONE]),
          ]),
          districtr_map_slug: districtrMap.districtr_map_slug,
          user_id: userID,
        });
        result &&
          setMapLinks(mapLinks => [
            ...mapLinks,
            // @ts-ignore
            {...districtrMap, document_id: result.document_id, filename: file.name},
          ]);
      } catch (error: unknown) {
        if (error instanceof AxiosError) {
          setError({
            ok: false,
            detail: {
              message: error.response?.data.detail,
            },
          });
        } else {
          setError('Unknown error encountered');
        }
      }
    },
  });
};
