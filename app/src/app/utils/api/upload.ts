'use client';
import React from 'react';
import Papa from 'papaparse';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {uploadAssignments} from './apiHandlers/uploadAssignments';
import {useMapStore} from '@/app/store/mapStore';

const MAX_ROWS = 914_231;
const ROWS_TO_TEST = 200;
const MAX_FILE_SIZE = 2_000_000_000; // 20mb

export type MapLink = DistrictrMap & {
  document_id: string;
  filename: string;
};

type UploadColumnName = 'GEOID' | 'ZONE';
type ColumnCandidateIndices = Record<UploadColumnName, Record<number, number>>;
type PartialColumnCandidateIndices = Partial<ColumnCandidateIndices>;
type ColumnIndices = Record<UploadColumnName, number>;

export type UploadErrorDetail = {
  message: string;
  headerRow?: string[];
  possibleIndices?: ColumnCandidateIndices;
  missingColumns?: UploadColumnName[];
  row?: string[];
  districtrMap?: DistrictrMap;
  expectedPrefix?: string;
  receivedState?: string;
  receivedPrefix?: string;
  expectedState?: string;
};

export type UploadValidationFailure = {
  ok: false;
  detail: UploadErrorDetail;
};

type UploadValidationSuccess = {
  ok: true;
  colIndices: ColumnIndices;
};

type UploadValidationResult = UploadValidationSuccess | UploadValidationFailure;
export type UploadProcessError = UploadValidationFailure | undefined;

const normalizeCandidateIndices = (
  candidateIndices: PartialColumnCandidateIndices
): ColumnCandidateIndices => ({
  GEOID: candidateIndices.GEOID ?? {},
  ZONE: candidateIndices.ZONE ?? {},
});

const getRowTests = (map: DistrictrMap): Array<{
  name: UploadColumnName;
  test: (value: string | number | null) => boolean;
  strict?: boolean;
}> => [
  {
    name: 'GEOID',
    test: (value: string | number | null) => {
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

const validateRows = (rows: Array<Array<string>>, plan: DistrictrMap): UploadValidationResult => {
  const tests = getRowTests(plan);
  const headerRow = rows[0];
  const candidateIndices: PartialColumnCandidateIndices = {};
  // skip header row
  const rowstoTest = rows.slice(1, ROWS_TO_TEST);
  rowstoTest.forEach((row, i) => {
    row.forEach((value, j) => {
      tests.forEach(test => {
        const indicesForName = candidateIndices[test.name] ?? {};
        candidateIndices[test.name] = indicesForName;
        if (test.test(value)) {
          indicesForName[j] = (indicesForName[j] ?? 0) + 1;
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
        possibleIndices: normalizeCandidateIndices(candidateIndices),
        headerRow,
      },
    };
  }

  const mostLikelyColumns: Partial<ColumnIndices> = {};
  const candidateIndicesKeys = Object.keys(candidateIndices);
  const missingColumns: UploadColumnName[] = [];
  for (let i = 0; i < candidateIndicesKeys.length; i++) {
    const key = candidateIndicesKeys[i] as UploadColumnName;
    const candidateFields = candidateIndices[key];
    if (!candidateFields) {
      missingColumns.push(key);
      continue;
    }
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
        possibleIndices: normalizeCandidateIndices(candidateIndices),
        message: 'Missing columns',
        missingColumns,
        headerRow,
      },
    };
  }

  return {
    ok: true,
    colIndices: mostLikelyColumns as ColumnIndices,
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
  setError: React.Dispatch<React.SetStateAction<UploadProcessError>>;
  districtrMap: DistrictrMap;
  config?: {
    ZONE: number;
    GEOID: number;
  };
}) => {
  const {setErrorNotification} = useMapStore.getState();
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
      const validation: UploadValidationResult = config
        ? {ok: true, colIndices: config}
        : validateRows(results.data as Array<Array<string>>, districtrMap);
      if (!validation.ok) {
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
        const uploadResult = await uploadAssignments({
          assignments: rows.map(row => [
            geoidHandler(row[GEOID]),
            !row[ZONE] ? '' : String(+row[ZONE]),
          ]),
          districtr_map_slug: districtrMap.districtr_map_slug,
        });
        if (uploadResult.ok && uploadResult.response?.document_id) {
          result = uploadResult.response;
          setMapLinks(mapLinks => [
            ...mapLinks,
            {...districtrMap, document_id: result!.document_id, filename: file.name},
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
