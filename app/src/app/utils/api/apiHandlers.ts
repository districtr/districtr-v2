import axios from "axios";
import "maplibre-gl";
import { useMapStore } from "@/app/store/mapStore";

export const FormatAssignments = () => {
  const assignments = Array.from(
    useMapStore.getState().zoneAssignments.entries(),
  ).map(
    // @ts-ignore
    ([geo_id, zone]: [string, number]): {
      document_id: string;
      geo_id: string;
      zone: number;
    } => ({
      document_id:
        useMapStore.getState().mapDocument?.document_id.toString() ?? "",
      geo_id,
      zone,
    }),
  );
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

export const createMapDocument: (
  document: DocumentCreate,
) => Promise<DocumentObject> = async (document: DocumentCreate) => {
  return await axios
    .post(`${process.env.NEXT_PUBLIC_API_URL}/api/create_document`, {
      gerrydb_table: document.gerrydb_table,
    })
    .then((res) => {
      return res.data;
    });
};

/**
 * Get data from current document.
 * @param document_id - string, the document id
 * @returns Promise<DocumentObject>
 */
export const getDocument: (
  document_id: string,
) => Promise<DocumentObject> = async (document_id: string) => {
  if (document_id) {
    return await axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}`)
      .then((res) => {
        return res.data;
      });
  } else {
    throw new Error("No document id found");
  }
};

export const getAssignments: (
  mapDocument: DocumentObject,
) => Promise<Assignment[]> = async (mapDocument) => {
  if (mapDocument) {
    return await axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/get_assignments/${mapDocument.document_id}`,
      )
      .then((res) => {
        return res.data;
      });
  } else {
    throw new Error("No document provided");
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

/**
 * Get zone populations from the server.
 * @param mapDocument - DocumentObject, the document object
 * @returns Promise<ZonePopulation[]>
 */
export const getZonePopulations: (
  mapDocument: DocumentObject,
) => Promise<ZonePopulation[]> = async (mapDocument) => {
  if (mapDocument) {
    return await axios
      .get(
        `${process.env.NEXT_PUBLIC_API_URL}/api/document/${mapDocument.document_id}/total_pop`,
      )
      .then((res) => {
        return res.data;
      });
  } else {
    throw new Error("No document provided");
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
  offset?: number,
) => Promise<DistrictrMap[]> = async (limit = 10, offset = 0) => {
  return await axios
    .get(
      `${process.env.NEXT_PUBLIC_API_URL}/api/gerrydb/views?limit=${limit}&offset=${offset}`,
    )
    .then((res) => {
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
  parent_path?: string
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
 *
 * @param assignments
 * @returns server object containing the updated assignments per geoid
 */
export const patchUpdateAssignments: (
  assignments: Assignment[],
) => Promise<AssignmentsCreate> = async (assignments: Assignment[]) => {
  return await axios
    .patch(`${process.env.NEXT_PUBLIC_API_URL}/api/update_assignments`, {
      assignments: assignments,
    })
    .then((res) => {
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
  parents: { geoids: string[] };
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
}) => Promise<ShatterResult> = async ({ document_id, geoids }) => {
  return await axios
    .patch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/update_assignments/${document_id}/shatter_parents`,
      {
        geoids: geoids,
      },
    )
    .then((res) => {
      return res.data;
    });
};
