'use client';
import React from 'react';
import Papa from 'papaparse';
import {
  Assignment,
  createMapDocument,
  DistrictrMap,
  uploadAssignments,
} from '@/app/utils/api/apiHandlers';
import {useMapStore} from '@/app/store/mapStore';

const ROWS_PER_BATCH = 20000000000;
const ROWS_TO_TEST = 200;
// 200mb
const MAX_FILE_SIZE = 20000000000;
const PREFIX_MAP = {
  AL: '01',
  NE: '31',
  AK: '02',
  NV: '32',
  AZ: '04',
  NH: '33',
  AR: '05',
  NJ: '34',
  CA: '06',
  NM: '35',
  CO: '08',
  NY: '36',
  CT: '09',
  NC: '37',
  DE: '10',
  ND: '38',
  DC: '11',
  OH: '39',
  FL: '12',
  OK: '40',
  GA: '13',
  OR: '41',
  HI: '15',
  PA: '42',
  ID: '16',
  PR: '72',
  IL: '17',
  RI: '44',
  IN: '18',
  SC: '45',
  IA: '19',
  SD: '46',
  KS: '20',
  TN: '47',
  KY: '21',
  TX: '48',
  LA: '22',
  UT: '49',
  ME: '23',
  VT: '50',
  MD: '24',
  VA: '51',
  MA: '25',
  VI: '78',
  MI: '26',
  WA: '53',
  MN: '27',
  WV: '54',
  MS: '28',
  WI: '55',
  MO: '29',
  WY: '56',
  MT: '30',
} as const;

export type MapLink = DistrictrMap & {
  document_id: string;
  filename: string;
};

const getPrefix = (map: DistrictrMap) => {
  const state = map.gerrydb_table_name.split('_')[0].toUpperCase() as keyof typeof PREFIX_MAP;
  return PREFIX_MAP[state];
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

  for (let i = 0; i < tests.length; i++) {
    if (tests[i].strict) {
      if (candidateIndices[tests[i].name][mostLikelyColumns[tests[i].name]] !== rowstoTest.length) {
        throw new Error(`Column ${tests[i].name} should be at index ${i}`);
      }
    }
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
  const mapState = useMapStore.getState();
  const setErrorNotification = mapState.setErrorNotification;
  if (!file) {
    setErrorNotification({
      message: 'No file selected',
      severity: 1,
    });
    throw new Error('No file selected');
  }
  if (file.size > MAX_FILE_SIZE) {
    setErrorNotification({
      message: 'Block CSV file size exceeds limit (200mb)',
      severity: 1,
    });
    throw new Error('Block CSV file size exceeds limit');
  }

  Papa.parse(file, {
    complete: async results => {
      const validation = config ? {ok: true, colIndices: config} : validateRows(results.data as Array<Array<string>>, districtrMap);
      if (!validation.ok || !validation.colIndices) {
        setError(validation);
        return validation;
      }

      const {GEOID, ZONE} = validation.colIndices;
      const statePrefix = getPrefix(districtrMap);
      // const documentId = await createMapDocument({
      //   gerrydb_table: districtrMap.gerrydb_table_name,
      // })
      let batch = 0;
      let result: {document_id: string} | undefined;
      let geoidHandler = (geoid: string | number) => `${geoid}`.padStart(15, '0');

      while (batch * ROWS_PER_BATCH < results.data.length) {
        const rows = results.data.slice(
          1 + batch * ROWS_PER_BATCH,
          1 + (batch + 1) * ROWS_PER_BATCH
        ) as string[][];
        if (batch === 0) {
          // skip header row
          for (let i = 1; i < ROWS_TO_TEST; i++) {
            const row = rows[i];
            // handle empty rows
            if (!row || (row.length === 1 && !row[0])) continue;
            const geoid = geoidHandler(row[GEOID]);
            if (!geoid.startsWith(statePrefix)) {
              const receivedPrefix = geoid.slice(0, 2);
              const receivedState = Object.keys(PREFIX_MAP).find(
                // @ts-ignore
                key => PREFIX_MAP[key] === receivedPrefix
              );
              setError({
                ok: false,
                detail: {
                  message: 'Block GEOID does not match state prefix',
                  row: row,
                  districtrMap,
                  expectedPrefix: statePrefix,
                  expectedState: districtrMap.gerrydb_table_name.split('_')[0].toUpperCase(),
                  receivedState,
                  receivedPrefix,
                },
              });
              return;
            }
          }
        }

        result = await uploadAssignments({
          assignments: rows.map(row => [
            geoidHandler(row[GEOID]),
            !row[ZONE] ? '' : String(+row[ZONE]),
          ]),
          gerrydb_table_name: districtrMap.gerrydb_table_name,
        });
        batch++;
      }
      result &&
        setMapLinks(mapLinks => [
          ...mapLinks,
          {...districtrMap, document_id: result.document_id, filename: file.name},
        ]);
    },
  });
};
