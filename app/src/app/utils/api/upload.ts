'use client';
import React from 'react';
import Papa from 'papaparse';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {uploadAssignments} from './apiHandlers/uploadAssignments';
import {useMapStore} from '@/app/store/mapStore';

const MAX_ROWS = 914_231;
const ROWS_TO_TEST = 200;
const MAX_FILE_SIZE = 20_000_000; // 20mb
const HEADER_MATCH_BONUS = ROWS_TO_TEST + 1;

type UploadStage = 'parsing' | 'validating' | 'uploading' | 'done';
type ColumnName = 'GEOID' | 'ZONE';
type UploadIssueDetail = {
  message: string;
  headerRow?: string[];
  missingColumns?: string[];
  possibleIndices?: Record<ColumnName, Record<number, number>>;
  suggestedIndices?: Partial<Record<ColumnName, number>>;
  row?: string[];
  expectedPrefix?: string;
  receivedState?: string;
  receivedPrefix?: string;
  expectedState?: string;
  summary?: {
    total_rows: number;
    inserted_assignments: number;
    null_zone_rows: number;
    invalid_zone_rows: number;
    invalid_geoid_rows: number;
    empty_geoid_rows: number;
  };
};

export type MapLink = DistrictrMap & {
  document_id: string;
  filename: string;
};

const getRowTests = (map: DistrictrMap) => [
  {
    name: 'GEOID',
    headerHints: [
      'geoid',
      'geo_id',
      'blockid',
      'block_geoid',
      'blockgeoid',
      'vtd_geoid',
      'vtdid',
      'censusblock',
      'census_geoid',
    ],
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
    headerHints: [
      'zone',
      'district',
      'districtid',
      'district_id',
      'districtnumber',
      'district_num',
      'assignment',
      'plan_district',
    ],
    test: (value: string | number | null) => {
      return !value || (!isNaN(+value) && +value > 0 && +value <= (map.num_districts ?? 4));
    },
  },
];

const validateRows = (rows: Array<Array<string>>, plan: DistrictrMap) => {
  const tests = getRowTests(plan);
  const headerRow = rows[0] ?? [];
  const candidateIndices: Record<string, Record<number, number>> = {};
  const normalizedHeaders = headerRow.map(header =>
    String(header ?? '')
      .toLowerCase()
      .replace(/[\s\-]+/g, '_')
  );

  tests.forEach(test => {
    candidateIndices[test.name] = {};
    normalizedHeaders.forEach((header, j) => {
      if (
        test.headerHints.some(hint => {
          return header === hint || header.includes(hint);
        })
      ) {
        candidateIndices[test.name][j] = (candidateIndices[test.name][j] ?? 0) + HEADER_MATCH_BONUS;
      }
    });
  });

  // skip header row
  const rowstoTest = rows.slice(1, ROWS_TO_TEST);
  rowstoTest.forEach(row => {
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

  const suggestedIndices: Partial<Record<ColumnName, number>> = {};
  Object.entries(candidateIndices).forEach(([columnName, indexScores]) => {
    const validScores = Object.entries(indexScores).filter(([, score]) => score > 0);
    if (!validScores.length) return;
    const max = Math.max(...validScores.map(([, score]) => score));
    const firstBestMatch = validScores.find(([, score]) => score === max)?.[0];
    if (firstBestMatch !== undefined) {
      suggestedIndices[columnName as ColumnName] = +firstBestMatch;
    }
  });

  const columnsAreAmbiguous = Object.values(candidateIndices).some(indexScores => {
    const validScores = Object.values(indexScores).filter(score => score > 0);
    if (!validScores.length) return false;
    const max = Math.max(...validScores);
    return validScores.filter(score => score === max).length > 1;
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
        suggestedIndices,
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
        suggestedIndices,
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

export const processFile = async ({
  file,
  setMapLinks,
  setError,
  districtrMap,
  config,
  onProgress,
}: {
  file: File;
  setMapLinks: React.Dispatch<React.SetStateAction<MapLink[]>>;
  setError: React.Dispatch<React.SetStateAction<any>>;
  districtrMap: DistrictrMap;
  config?: {
    ZONE: number;
    GEOID: number;
  };
  onProgress?: (progress: {
    stage: UploadStage;
    message: string;
    processedRows?: number;
    totalRows?: number;
  }) => void;
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

  onProgress?.({stage: 'parsing', message: 'Parsing CSV file'});

  await new Promise<void>((resolve, reject) => {
    Papa.parse(file, {
      skipEmptyLines: 'greedy',
      complete: async results => {
        onProgress?.({stage: 'validating', message: 'Validating columns and records'});
        const parsedRows = (results.data as Array<Array<string>>).filter(
          row => Array.isArray(row) && row.length
        );
        if (parsedRows.length < 2) {
          setError({
            ok: false,
            detail: {message: 'CSV must contain a header row and at least one data row'},
          });
          onProgress?.({stage: 'done', message: 'Upload failed'});
          resolve();
          return;
        }

        const validation = config
          ? {ok: true, colIndices: config}
          : validateRows(parsedRows, districtrMap);
        if (!validation.ok || !validation.colIndices) {
          setError(validation);
          onProgress?.({stage: 'done', message: 'Upload failed'});
          resolve();
          return;
        }

        const {GEOID, ZONE} = validation.colIndices;
        const geoidHandler = (geoid: string | number) => `${geoid}`.padStart(15, '0');

        // All rows without the header
        const rows = parsedRows.slice(1) as string[][];

        if (rows.length > MAX_ROWS) {
          setError({
            ok: false,
            detail: {message: `Cannot upload more than ${MAX_ROWS} rows at once`},
          });
          onProgress?.({stage: 'done', message: 'Upload failed'});
          resolve();
          return;
        }

        try {
          onProgress?.({
            stage: 'uploading',
            message: 'Uploading assignments',
            totalRows: rows.length,
          });
          const uploadResult = await uploadAssignments({
            assignments: rows.map(row => [geoidHandler(row[GEOID]), !row[ZONE] ? '' : String(+row[ZONE])]),
            districtr_map_slug: districtrMap.districtr_map_slug,
            strict_assignment_validation: true,
          });
          if (uploadResult.ok && uploadResult.response?.document_id) {
            if (uploadResult.response.import_summary && uploadResult.response.import_summary.null_zone_rows > 0) {
              setErrorNotification({
                message: `Imported ${uploadResult.response.import_summary.inserted_assignments} assignments. ${uploadResult.response.import_summary.null_zone_rows} rows were left unassigned because zone was blank.`,
                severity: 2,
              });
            }
            setMapLinks(mapLinks => [
              ...mapLinks,
              {...districtrMap, document_id: uploadResult.response.document_id, filename: file.name},
            ]);
            onProgress?.({stage: 'done', message: 'Upload complete', processedRows: rows.length});
          } else {
            const detail = uploadResult.ok
              ? {message: 'Unknown error encountered while uploading assignments'}
              : uploadResult.error?.detail;
            const normalizedDetail: UploadIssueDetail =
              typeof detail === 'string'
                ? {message: detail}
                : typeof detail === 'object' && detail !== null
                  ? ({
                      message: String((detail as UploadIssueDetail).message ?? 'Upload failed'),
                      ...(detail as UploadIssueDetail),
                    } as UploadIssueDetail)
                  : {message: 'Unknown error encountered while uploading assignments'};
            setError({
              ok: false,
              detail: normalizedDetail,
            });
            onProgress?.({stage: 'done', message: 'Upload failed'});
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
          onProgress?.({stage: 'done', message: 'Upload failed'});
        }
        resolve();
      },
      error: error => {
        setError({
          ok: false,
          detail: {
            message: error.message || 'Failed to parse CSV file',
          },
        });
        onProgress?.({stage: 'done', message: 'Upload failed'});
        reject(error);
      },
    });
  });
};
