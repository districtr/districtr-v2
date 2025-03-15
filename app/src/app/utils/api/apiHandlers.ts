import axios from 'axios';
import 'maplibre-gl';
import {useMapStore} from '@store/mapStore';
import {useChartStore} from '@store/chartStore';
import {NullableZone} from '@constants/types';
import {colorScheme as DefaultColorScheme} from '@constants/colors';
import {SummaryStatKeys, SummaryStatsResult, SummaryTypes, TotalColumnKeys} from './summaryStats';

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
 * @property {string[]} color_scheme - The colors for districts.
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
  map_metadata: DocumentMetadata;
  available_summary_stats: Array<SummaryTypes>;
  color_scheme: string[] | null;
  status: 'locked' | 'unlocked' | 'checked_out';
  access: 'read' | 'edit';
  genesis: 'shared' | 'copied' | 'created';
  token?: string | null;
  password?: string | null;
}

export interface DocumentMetadata {
  name: string | null;
  group: string | null;
  tags: string | null;
  description: string | null;
  eventId: string | null;
  is_draft: boolean;
}

/**
 * GerryDB view.
 *
 * @interface
 * @property {string} gerrydb_table - The gerrydb table.
 */
export interface DocumentCreate {
  gerrydb_table: string;
  user_id: string | null;
  metadata?: DocumentMetadata;
  copy_from_doc?: string;
}

export const createMapDocument: (document: DocumentCreate) => Promise<DocumentObject> = async (
  document: DocumentCreate
) => {
  if (!document.user_id) return;
  return await axios
    .post(`${process.env.NEXT_PUBLIC_API_URL}/api/create_document`, document)
    .then(res => {
      return res.data;
    })
    .catch(err => {
      console.error(err);
    });
};

/**
 * Get data from current document.
 * @param document_id - string, the document id
 * @param userID - string, the user id against which to check document status
 * @returns Promise<DocumentObject>
 */
export const getDocument: (document_id: string) => Promise<DocumentObject> = async (
  document_id: string
) => {
  const userID = useMapStore.getState().userID;
  if (document_id && userID) {
    return await axios
      .post(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}`, {
        user_id: userID,
      })
      .then(res => {
        return res.data;
      });
  } else {
    throw new Error('No document id found');
  }
};

/**
 *
 * @param mapDocument Unlock the document
 * @returns
 */

export const unlockMapDocument: (document_id: string) => Promise<DocumentObject> = async (
  document_id: string
) => {
  const userID = useMapStore.getState().userID;
  if (document_id && userID) {
    return await axios
      .post(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/unlock`, {
        user_id: userID,
      })
      .then(res => {
        return res.data;
      });
  } else {
    throw new Error('No document id found');
  }
};

export const getMapLockStatus: (document_id: string) => Promise<string> = (document_id: string) => {
  const userID = useMapStore.getState().userID;
  return axios
    .post(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/status`, {
      user_id: userID,
    })
    .then(res => {
      return res.data.status;
    });
};

export type RemoteAssignmentsResponse = {
  type: 'remote';
  documentId: string;
  assignments: Assignment[];
};

type GetAssignmentsResponse = Promise<RemoteAssignmentsResponse | null>;

export const getAssignments: (
  mapDocument: DocumentObject | null
) => GetAssignmentsResponse = async mapDocument => {
  if (
    mapDocument &&
    mapDocument.document_id === useMapStore.getState().loadedMapId &&
    useMapStore.getState().assignmentsHash
  ) {
    console.log(
      'Map already loaded, skipping assignment load in handlers',
      mapDocument.document_id,
      useMapStore.getState().loadedMapId
    );
    return null;
  }
  if (mapDocument) {
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
 * @property {number} total_pop_20 - The total population.
 */
export interface ZonePopulation {
  zone: number;
  total_pop_20: number;
}

/**
 * Get zone populations from the server.
 * @param mapDocument - DocumentObject, the document object
 * @returns Promise<ZonePopulation[]>
 */
export const getContiguity: (mapDocument: DocumentObject) => Promise<any> = async mapDocument => {
  // const assignmentHash = `${useMapStore.getState().assignmentsHash}`;
  // if (currentHash !== assignmentHash) {
  //   // return stale data if map already changed
  //   return {};
  // }
  if (mapDocument) {
    return await axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument.document_id}/contiguity`,
        {}
      )
      .then(res => {
        return res.data;
      });
  } else {
    throw new Error('No document provided');
  }
};

/**
 * Get zone populations from the server.
 * @param mapDocument - DocumentObject, the document object
 * @param zone - number, the zone id
 * @returns Promise<GeoJSON[]>
 */
export const getZoneConnectedComponentBBoxes: (
  mapDocument: DocumentObject,
  zone: number
) => Promise<any> = async (mapDocument, zone) => {
  if (mapDocument) {
    return await axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument.document_id}/contiguity/${zone}/connected_component_bboxes`,
        {}
      )
      .then(res => {
        return res.data;
      });
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

/**
 *
 * @param document_id - string, the document id
 * @param metadata - DocumentMetadata, the metadata to save
 * @returns Promise
 */
export const saveMapDocumentMetadata = async ({
  document_id,
  metadata,
  // for consistency, does it make sense to also require a user id? not convinced but
}: {
  document_id: string;
  metadata: DocumentMetadata;
}) => {
  return await axios
    .put(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/metadata`, metadata)
    .then(res => {
      return res.data;
    })
    .catch(err => {
      console.error(err);
    });
};

/**
 * Creates a share link for a document.
 *
 * @param document_id - string, the document_id
 * @param password - string, the password if required
 * @param access_type - string, the access type (read or edit)
 * @returns Promise
 */
export const getSharePlanLink = async ({
  document_id,
  password,
  access_type,
}: {
  document_id: string | undefined;
  password: string | null;
  access_type: string | undefined;
}) => {
  try {
    const res = await axios.post(
      `${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/share`,
      {
        password: password ?? null,
        access_type: access_type ?? 'read',
      }
    );
    if (!res.data) {
      throw new Error('No token returned from API');
    }
    return res.data;
  } catch (err) {
    console.error('Error in getSharePlanLink: ', err);
    throw err;
  }
};

/**
 * Loads plan from share link.
 *
 * @param token - string, the tokenized share link
 * @param password - string, the password if required
 * @param access - string, the access type (set via share link)
 * @returns Promise
 */
export const getLoadPlanFromShare = async ({
  token,
  password,
  access,
}: {
  token: string;
  password?: string | null;
  access: string;
}) => {
  const res = await axios.post(
    `${process.env.NEXT_PUBLIC_API_URL}/api/share/load_plan_from_share`,
    {
      token: token,
      user_id: useMapStore.getState().userID,
      password: password ?? null,
      access: access,
    },
    {headers: {'Content-Type': 'application/json'}}
  );
  return res.data; // failure is handled in mutations.ts
};

/**
 * Set colors response
 *   @interface
 *   @property {boolean} success - Confirming if the operation succeeded
 *   @property {string} document_id - Document ID
 */
export interface ColorsSet {
  success: boolean;
  document_id: string;
}

/**
 * Save changed colors
 *
 * @param document_id - string, the document id
 * @param color_scheme - string[], the hex colors for districts
 */
export const saveColorScheme: (params: {
  document_id: string;
  colors: string[];
}) => Promise<ColorsSet> = async ({document_id, colors}) => {
  if (colors === DefaultColorScheme) {
    return;
  }
  return await axios
    .patch(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/update_colors`, colors)
    .then(res => {
      return res.data;
    });
};

/**
 * Fetches demography table for a given document.
 *
 * @param document_id - string, the document_id
 * @param ids - Optional array of IDs to filter the demography data.
 * @returns A promise that resolves to an object containing a lsit of columns and results (2d array).
 * @throws Will throw an error if the request fails.
 */
export const getDemography: (params: {
  document_id?: string;
  ids?: string[];
  dataHash?: string;
}) => Promise<{columns: string[]; results: (string | number)[][]; dataHash?: string}> = async ({
  document_id,
  ids,
  dataHash,
}) => {
  if (!document_id) {
    throw new Error('No document id provided');
  }
  const fetchUrl = new URL(
    `${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/demography`
  );
  ids?.forEach(id => fetchUrl.searchParams.append('ids', id));
  const result = await axios.get(fetchUrl.toString()).then(res => res.data);
  return {
    columns: result.columns,
    results: result.results,
    dataHash: dataHash,
  };
};
