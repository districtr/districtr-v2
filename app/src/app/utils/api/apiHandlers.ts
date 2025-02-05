import axios from 'axios';
import 'maplibre-gl';
import {MapStore, useMapStore} from '@store/mapStore';
import {getEntryTotal} from '@utils/summaryStats';
import {useChartStore} from '@store/chartStore';
import {NullableZone} from '@constants/types';
import {districtrIdbCache} from '@utils/cache';

export const lastSentAssignments = new Map<string, NullableZone>();
export const FormatAssignments = () => {
  // track the geoids that have been painted, but are now not painted
  const {allPainted, shatterIds} = useMapStore.getState();
  const assignmentsVisited = new Set([...allPainted]);
  const assignments: Assignment[] = [];
  const subZoneAssignments = new Map();

  Array.from(useMapStore.getState().zoneAssignments.entries()).forEach(
    // @ts-ignore
    ([geo_id, zone]: [string, number]): {
      document_id: string;
      geo_id: string;
      zone: NullableZone;
    } => {
      assignmentsVisited.delete(geo_id);
      if (lastSentAssignments.get(geo_id) !== zone) {
        lastSentAssignments.set(geo_id, zone);
        subZoneAssignments.set(geo_id, zone);
        assignments.push({
          document_id: useMapStore.getState().mapDocument?.document_id || '',
          geo_id,
          zone,
        });
      }
    }
  );
  // fill in with nulls removes assignments from backend
  // otherwise the previous assignment remains
  assignmentsVisited.forEach(geo_id => {
    if (lastSentAssignments.get(geo_id) !== null && !shatterIds.parents.has(geo_id)) {
      lastSentAssignments.set(geo_id, null);
      assignments.push({
        document_id: useMapStore.getState().mapDocument?.document_id || '',
        geo_id,
        // @ts-ignore assignment wants to be number
        zone: null,
      });
      subZoneAssignments.set(geo_id, null);
    }
  });
  return assignments;
};

/**
 * DistrictrMap
 *
 * @interface
 * @property {string} name - The name.
 * @property {string} gerrydb_table_name - The gerrydb table name.
 * @property {string} parent_layer - The parent layer.
 * @property {string | null} child_layer - The child layer.
 * @property {string | null} tiles_s3_path - The tiles s3 path.
 * @property {number | null} num_districts - The number of districts.
 */
export interface DistrictrMap {
  name: string;
  gerrydb_table_name: string;
  parent_layer: string;
  child_layer: string | null;
  tiles_s3_path: string | null;
  num_districts: number | null;
}

/**
 * Document
 *
 * @interface
 * @property {string} document_id - The document id.
 * @property {string} gerrydb_table - The gerrydb table.
 * @property {string} parent_layer_name - The parent layer name.
 * @property {string | null} child_layer_name - The child layer name.
 * @property {string | null} tiles_s3_path - The tiles s3 path.
 * @property {number | null} num_districts - The number of districts to enforce.
 * @property {string} created_at - The created at.
 * @property {string} updated_at - The updated at.
 */
export interface DocumentObject {
  document_id: string;
  gerrydb_table: string;
  parent_layer: string;
  child_layer: string | null;
  tiles_s3_path: string | null;
  num_districts: number | null;
  created_at: string;
  updated_at: string | null;
  extent: [number, number, number, number]; // [minx, miny, maxx, maxy]
  available_summary_stats: string[];
}

/**
 * GerryDB view.
 *
 * @interface
 * @property {string} gerrydb_table - The gerrydb table.
 */
export interface DocumentCreate {
  gerrydb_table: string;
}

export const createMapDocument: (document: DocumentCreate) => Promise<DocumentObject> = async (
  document: DocumentCreate
) => {
  return await axios
    .post(`${process.env.NEXT_PUBLIC_API_URL}/api/create_document`, {
      gerrydb_table: document.gerrydb_table,
    })
    .then(res => {
      return res.data;
    });
};

/**
 * Get data from current document.
 * @param document_id - string, the document id
 * @returns Promise<DocumentObject>
 */
export const getDocument: (document_id: string) => Promise<DocumentObject> = async (
  document_id: string
) => {
  if (document_id) {
    return await axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}`)
      .then(res => {
        return res.data;
      });
  } else {
    throw new Error('No document id found');
  }
};

export type RemoteAssignmentsResponse = {
  type: 'remote';
  documentId: string;
  assignments: Assignment[];
};

export type LocalAssignmentsResponse = {
  type: 'local';
  documentId: string;
  data: {
    zoneAssignments: MapStore['zoneAssignments'];
    shatterIds: MapStore['shatterIds'];
    shatterMappings: MapStore['shatterMappings'];
  };
};

type GetAssignmentsResponse = Promise<RemoteAssignmentsResponse | LocalAssignmentsResponse | null>;

export const getAssignments: (
  mapDocument: DocumentObject | null
) => GetAssignmentsResponse = async mapDocument => {
  if (mapDocument && mapDocument.document_id === useMapStore.getState().loadedMapId) {
    console.log(
      'Map already loaded, skipping assignment load',
      mapDocument.document_id,
      useMapStore.getState().loadedMapId
    );
    return null;
  }
  if (mapDocument) {
    if (mapDocument.updated_at) {
      const localCached = await districtrIdbCache.getCachedAssignments(
        mapDocument.document_id,
        mapDocument.updated_at
      );
      if (localCached) {
        try {
          return {
            type: 'local',
            documentId: mapDocument.document_id,
            data: localCached
          };
        } catch (e) {
          console.error(e);
        }
      }
    }
    return await axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/api/get_assignments/${mapDocument.document_id}`)
      .then(res => {
        return {
          type: 'remote',
          documentId: mapDocument.document_id,
          assignments: res.data as Assignment[],
        };
      });
  } else {
    throw new Error('No document provided');
  }
};

/**
 * ZonePopulation
 *
 * @interface
 * @property {number} zone - The zone.
 * @property {number} total_pop - The total population.
 */
export interface ZonePopulation {
  zone: number;
  total_pop: number;
}

// TODO: Tanstack has a built in abort controller, we should use that
// https://tanstack.com/query/v5/docs/framework/react/guides/query-cancellation
export let populationAbortController: AbortController | null = null;
export let currentHash: string = '';

/**
 * Get zone populations from the server.
 * @param mapDocument - DocumentObject, the document object
 * @returns Promise<ZonePopulation[]>
 */
export const getZonePopulations: (
  mapDocument: DocumentObject
) => Promise<{data: ZonePopulation[]; hash: string}> = async mapDocument => {
  populationAbortController?.abort();
  populationAbortController = new AbortController();
  const assignmentHash = `${useMapStore.getState().assignmentsHash}`;
  if (currentHash !== assignmentHash) {
    // return stale data if map already changed
    return {
      data: useChartStore.getState().mapMetrics?.data || [],
      hash: assignmentHash,
    };
  }
  if (mapDocument) {
    return await axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument.document_id}/total_pop`, {
        signal: populationAbortController.signal,
      })
      .then(res => {
        return {
          data: res.data as ZonePopulation[],
          hash: assignmentHash,
        };
      });
  } else {
    throw new Error('No document provided');
  }
};

export interface SummaryStatsResult<T extends object> {
  summary_stat: string;
  results: T;
}

/**
 * P1ZoneSummaryStats
 *
 * @interface
 * @property {number} zone - The zone.
 * @property {number} total_pop - The total population.
 */
export interface P1ZoneSummaryStats {
  zone: number;
  other_pop: number;
  asian_pop: number;
  amin_pop: number;
  nhpi_pop: number;
  black_pop: number;
  white_pop: number;
  two_or_more_races_pop: number;
}
export type P1TotPopSummaryStats = Omit<P1ZoneSummaryStats, 'zone'>;

export const P1ZoneSummaryStatsKeys = [
  'other_pop',
  'asian_pop',
  'amin_pop',
  'nhpi_pop',
  'black_pop',
  'white_pop',
  'two_or_more_races_pop',
] as const;

export const CleanedP1ZoneSummaryStatsKeys = [
  ...P1ZoneSummaryStatsKeys,
  'total',
  'other_pop_pct',
  'asian_pop_pct',
  'amin_pop_pct',
  'nhpi_pop_pct',
  'black_pop_pct',
  'white_pop_pct',
  'two_or_more_races_pop_pct',
] as const;

export interface CleanedP1ZoneSummaryStats extends P1ZoneSummaryStats {
  total: number;
  other_pop_pct: number;
  asian_pop_pct: number;
  amin_pop_pct: number;
  nhpi_pop_pct: number;
  black_pop_pct: number;
  white_pop_pct: number;
  two_or_more_races_pop_pct: number;
}

/**
 * P4ZoneSummaryStats
 *
 * @interface
 * @property {number} zone - The zone.
 * @property {number} total_pop - The total population.
 */
export interface P4ZoneSummaryStats {
  zone: number;
  hispanic_vap: number;
  non_hispanic_asian_vap: number;
  non_hispanic_amin_vap: number;
  non_hispanic_nhpi_vap: number;
  non_hispanic_black_vap: number;
  non_hispanic_white_vap: number;
  non_hispanic_other_vap: number;
  non_hispanic_two_or_more_races_vap: number;
}
export type P4TotPopSummaryStats = Omit<P4ZoneSummaryStats, 'zone'>;

export const P4ZoneSummaryStatsKeys = [
  'hispanic_vap',
  'non_hispanic_asian_vap',
  'non_hispanic_amin_vap',
  'non_hispanic_nhpi_vap',
  'non_hispanic_black_vap',
  'non_hispanic_white_vap',
  'non_hispanic_other_vap',
  'non_hispanic_two_or_more_races_vap',
] as const;

export const CleanedP4ZoneSummaryStatsKeys = [
  ...P4ZoneSummaryStatsKeys,
  'total',
  'hispanic_vap',
  'non_hispanic_asian_vap',
  'non_hispanic_amin_vap',
  'non_hispanic_nhpi_vap',
  'non_hispanic_black_vap',
  'non_hispanic_white_vap',
  'non_hispanic_other_vap',
  'non_hispanic_two_or_more_races_vap',
] as const;

export interface CleanedP4ZoneSummaryStats extends P4ZoneSummaryStats {
  total: number;
  hispanic_vap: number;
  non_hispanic_asian_vap: number;
  non_hispanic_amin_vap: number;
  non_hispanic_nhpi_vap: number;
  non_hispanic_black_vap: number;
  non_hispanic_white_vap: number;
  non_hispanic_other_vap: number;
  non_hispanic_two_or_more_races_vap: number;
}

/**
 * Get zone stats from the server.
 * @param mapDocument - DocumentObject, the document object
 * @param summaryType - string, the summary type
 * @returns Promise<CleanedP1ZoneSummaryStats[] | CleanedP4ZoneSummaryStats[]>
 */
export const getSummaryStats: (
  mapDocument: DocumentObject,
  summaryType: string | null | undefined
) => Promise<
  SummaryStatsResult<CleanedP1ZoneSummaryStats[] | CleanedP4ZoneSummaryStats[]>
> = async (mapDocument, summaryType) => {
  if (mapDocument && summaryType) {
    return await axios
      .get<
        SummaryStatsResult<P1ZoneSummaryStats[] | P4ZoneSummaryStats[]>
      >(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument.document_id}/evaluation/${summaryType}`)
      .then(res => {
        const results = res.data.results.map(row => {
          const total = getEntryTotal(row);

          const zoneSummaryStatsKeys = (() => {
            switch (summaryType) {
              case 'P1':
                return P1ZoneSummaryStatsKeys;
              case 'P4':
                return P4ZoneSummaryStatsKeys;
              default:
                throw new Error('Invalid summary type');
            }
          })();

          return zoneSummaryStatsKeys.reduce<any>(
            (acc, key) => {
              acc[`${key}_pct`] = acc[key] / total;
              return acc;
            },
            {
              ...row,
              total,
            }
          ) as CleanedP1ZoneSummaryStats;
        });
        return {
          ...res.data,
          results,
        };
      });
  } else {
    throw new Error('No document provided');
  }
};

/**
 * Get P1 zone stats from the server.
 * @param mapDocument - DocumentObject, the document object
 * @returns Promise<CleanedP1ZoneSummaryStats[]>
 */
export const getTotPopSummaryStats: (
  mapDocument: DocumentObject | null,
  summaryType: string | null | undefined
) => Promise<SummaryStatsResult<P1TotPopSummaryStats | P4TotPopSummaryStats>> = async (
  mapDocument,
  summaryType
) => {
  if (mapDocument && summaryType) {
    return await axios
      .get<
        SummaryStatsResult<P1TotPopSummaryStats | P4TotPopSummaryStats>
      >(`${process.env.NEXT_PUBLIC_API_URL}/api/districtrmap/${mapDocument.parent_layer}/evaluation/${summaryType}`)
      .then(res => res.data);
  } else {
    throw new Error('No document provided');
  }
};

/**
 * Get available DistrictrMap views from the server.
 * @param limit - number, the number of views to return (default 10, max 100)
 * @param offset - number, the number of views to skip (default 0)
 * @returns Promise
 */
export const getAvailableDistrictrMaps: (
  limit?: number,
  offset?: number
) => Promise<DistrictrMap[]> = async (limit = 10, offset = 0) => {
  return await axios
    .get(`${process.env.NEXT_PUBLIC_API_URL}/api/gerrydb/views?limit=${limit}&offset=${offset}`)
    .then(res => {
      return res.data;
    });
};

/**
 * Single document assignment
 *   @interface
 *   @property {string} document_id - The document id.
 *   @property {string} geo_id - The geo id.
 *   @property {number} zone - The zone.
 */
export interface Assignment {
  document_id: string;
  geo_id: string;
  zone: number;
  parent_path?: string;
}

/**
 * Assignments create response
 *   @interface
 *   @property {number} assignments_upserted - The number of assignments upserted.
 */
export interface AssignmentsCreate {
  assignments_upserted: number;
}

/**
 * Reset assignments response
 *   @interface
 *    @property {boolean} success - Confirming if the operation succeeded
 *   @property {string} document_id - Document ID where assignments were dropped
 */
export interface AssignmentsReset {
  success: boolean;
  document_id: string;
}

/**
 *
 * @param assignments
 * @returns server object containing the updated assignments per geoid
 */
export const patchUpdateAssignments: (upadteData: {
  assignments: Assignment[];
  updateHash: string;
}) => Promise<AssignmentsCreate> = async ({assignments, updateHash}) => {
  currentHash = `${useMapStore.getState().assignmentsHash}`;
  return await axios
    .patch(`${process.env.NEXT_PUBLIC_API_URL}/api/update_assignments`, {
      assignments: assignments,
      updated_at: updateHash,
    })
    .then(res => {
      return res.data;
    });
};

/**
 *
 * @param assignments
 * @returns server object containing the updated assignments per geoid
 */
export const patchUpdateReset: (
  document_id: string
) => Promise<AssignmentsReset> = async document_id => {
  return await axios
    .patch(`${process.env.NEXT_PUBLIC_API_URL}/api/update_assignments/${document_id}/reset`, {
      document_id,
    })
    .then(res => {
      return res.data;
    });
};

/**
 * Shatter result
 *   @interface
 *   @property {string[]} parents - The parents.
 *   @property {Assignment[]} children - The children.
 */
export interface ShatterResult {
  parents: {geoids: string[]};
  children: Assignment[];
}

/**
 * Shatter parents
 *
 * @param document_id - string, the document id
 * @param geoids - string[], the geoids to shatter
 * @returns list of child assignments results from shattered parents
 */
export const patchShatterParents: (params: {
  document_id: string;
  geoids: string[];
  updateHash: string;
}) => Promise<ShatterResult> = async ({document_id, geoids, updateHash}) => {
  return await axios
    .patch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/update_assignments/${document_id}/shatter_parents`,
      {
        geoids: geoids,
        updated_at: updateHash,
      }
    )
    .then(res => {
      return res.data;
    });
};

/**
 * Shatter parents
 *
 * @param document_id - string, the document id
 * @param geoids - string[], the geoids to shatter
 * @returns list of child assignments results from shattered parents
 */
export const patchUnShatterParents: (params: {
  document_id: string;
  geoids: string[];
  zone: number;
  updateHash: string;
}) => Promise<{geoids: string[]}> = async ({document_id, geoids, zone, updateHash}) => {
  return await axios
    .patch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/update_assignments/${document_id}/unshatter_parents`,
      {
        geoids,
        zone,
        updated_at: updateHash,
      }
    )
    .then(res => {
      return res.data;
    });
};
