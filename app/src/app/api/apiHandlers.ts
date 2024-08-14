import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import "maplibre-gl";
import { useMapStore } from "@/app/store/mapStore";
import { SetUpdateUrlParams } from "../utils/events/mapEvents";
import type { QueryFunction } from "@tanstack/react-query";
import {
  SelectMapFeatures,
  SelectZoneAssignmentFeatures,
} from "../utils/events/handlers";

interface responseObject {
  data: any;
}

/**
 * Hook to save map data to the server, using a mutation.
 * Should be agnostic to the mutationFn used.
 * @returns mutation to be used in calling hook component, e.g. localMutationVar.mutate()
 */
export const usePostMapData = () => {
  const mutation = useMutation({
    mutationFn: createMapObject,
    onMutate: (variables) => {
      // A mutation is about to happen, prepare for transaction
      // this id can be used on server side to rollback if needed
      return {
        id: Math.random().toString(36).substring(7), // Optimistic ID
      };
    },
    onError: (error, variables, context) => {
      // An error happened!
      console.log(`Rolling back optimistic update with id ${context?.id}`);
    },
    onSuccess: (data, variables, context) => {
      // Handle successful mutation
      console.log(`Mutation ${context.id} successful!`, data);
    },
    onSettled: (data, error, variables, context) => {
      // fires regardless of error or success
      console.log(`Optimistic update with id ${context?.id} settled: `);
      if (error) {
        console.log("Error: ", error);
      }
      if (data) {
        useMapStore.setState({ documentId: data });
      }
    },
  });

  return mutation;
};

/**
 *
 * @returns mutation to be used in calling hook component, e.g. localMutationVar.mutate()
 */
export const usePatchUpdateAssignments = () => {
  const mutation = useMutation({
    mutationFn: patchUpdateAssignments,
    onMutate: (variables) => {
      // A mutation is about to happen, prepare for transaction
      // this id can be used on server side to rollback if needed
      return {
        id: Math.random().toString(36).substring(7), // Optimistic ID
      };
    },
    onError: (error, variables, context) => {
      // An error happened!
      console.log(`Rolling back optimistic update with id ${context?.id}`);
    },
    onSuccess: (data, variables, context) => {
      // Handle successful mutation
      console.log(`Mutation ${context.id} successful!`, data);
    },
    onSettled: (data, error, variables, context) => {
      // fires regardless of error or success
      console.log(`Optimistic update with id ${context?.id} settled: `);
      if (error) {
        console.log("Error: ", error);
      }
      if (data) {
        console.log("assignments updated");
      }
    },
  });

  return mutation;
};

export const FormatAssignments = () => {
  const assignments = Array.from(
    useMapStore.getState().zoneAssignments.entries()
  ).map(
    // @ts-ignore
    ([geo_id, zone]: [string, number]): {
      document_id: string;
      geo_id: string;
      zone: number;
    } => ({
      document_id: useMapStore.getState().documentId?.toString() ?? "",
      geo_id,
      zone,
    })
  );
  return assignments;
};

const PatchUpdateSubscription = () => {
  const patcher = usePatchUpdateAssignments();
  const unsubscribe = useMapStore.subscribe(
    (state) => state.zoneAssignments as Map<string, number>,
    // @ts-ignore
    (zoneAssignments) => {
      console.log("zoneAssignments updated", zoneAssignments);
      const assignments = Array.from(zoneAssignments.entries()).map(
        // @ts-ignore
        ([geo_id, zone]: [string, number]): {
          document_id: string;
          geo_id: string;
          zone: number;
        } => ({
          document_id: useMapStore.getState().documentId?.toString() ?? "",
          geo_id,
          zone,
        })
      );
      patcher.mutate(assignments);
    }
  );
};

export const useCreateMapDocument = () => {
  const mutation = useMutation({
    mutationFn: createMapObject,
    onMutate: (variables) => {
      // A mutation is about to happen, prepare for transaction
      // this id can be used on server side to rollback if needed
      return {
        id: Math.random().toString(36).substring(7), // Optimistic ID
      };
    },
    onError: (error, variables, context) => {
      // An error happened!
      console.log(`Rolling back optimistic update with id ${context?.id}`);
    },
    onSuccess: (data, variables, context) => {
      // Handle successful mutation
      console.log(`Mutation ${context.id} successful!`, data);
    },
    onSettled: (data, error, variables, context) => {
      // fires regardless of error or success
      console.log(`Optimistic update with id ${context?.id} settled: `);
      if (error) {
        console.log("Error: ", error);
      }
      if (data) {
        useMapStore.setState({ documentId: data });
        // add document id to search params store item
        const { router, pathname, urlParams } = useMapStore.getState();
        urlParams.set("document_id", data.document_id);
        SetUpdateUrlParams(router, pathname, urlParams);
      }
    },
  });

  return mutation;
};

/**
 * Hook to get map data from the server, using a query.
 * Triggered in the HandleUrlParams function upon the page loading
 * @returns result of the query to be used in calling hook component,
 * including result.data, result.isPending, result.isError, result.error
 */
export const useGetMapData = () => {
  const result = useQuery({
    queryKey: ["documentId"],
    queryFn: getMapObject,
  });

  return result;
};

/**
 * GerryDB view.
 *
 * @interface
 * @property {string} document_id - The document id.
 * @property {string} gerrydb_table - The gerrydb table.
 * @property {string} created_at - The created at.
 * @property {string} updated_at - The updated at.
 * @property {string} tiles_s3_path - The tiles s3 path.
 */
export interface DocumentObject {
  document_id: string;
  gerrydb_table: string;
  created_at: string;
  updated_at: string;
  tiles_s3_path: string | null;
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

const createMapObject: (
  document: DocumentCreate
) => Promise<DocumentObject> = async (document: DocumentCreate) => {
  try {
    return await axios
      .post(`${process.env.NEXT_PUBLIC_API_URL}/api/create_document`, {
        gerrydb_table: document.gerrydb_table,
      }) // should replace with env var
      .then((res) => {
        // successful roundtrip; return the document id
        return res.data;
      });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Axios error:", error.message);
      if (error.response) {
        console.error("Response data:", error.response.data);
        console.error("Response status:", error.response.status);
        console.error("Response headers:", error.response.headers);
      }
    } else {
      console.error("Unexpected error:", error);
    }
    throw error;
  }
};

/**
 * Get data from current document.
 * @param document_id - string, the document id
 * @returns Promise<DocumentObject>
 */
export const getDocument: (
  document_id: string
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

export const getMapObject: QueryFunction<
  responseObject,
  [string]
> = async () => {
  const documentId = useMapStore.getState().documentId;
  if (documentId) {
    try {
      const returnObject = await axios
        .get(`${process.env.NEXT_PUBLIC_API_URL}/get_assignments/${documentId}`)
        .then((res) => {
          return res.data;
        });

      // need to select features here, on map
      // and in store, on map load
      SelectMapFeatures(
        returnObject.data,
        // @ts-ignore
        useMapStore.getState().mapRef,
        useMapStore
      ).then(() => {
        SelectZoneAssignmentFeatures(useMapStore.getState());
      });
      return { data: returnObject };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error("i couldn't get the data", error.message);
        console.error("Axios error:", error.message);
        if (error.response) {
          console.error("Response data:", error.response.data);
          console.error("Response status:", error.response.status);
          console.error("Response headers:", error.response.headers);
        }
      } else {
        console.error("Unexpected error:", error);
      }
      throw error;
    }
  }
  return { data: null };
};

/**
 * GerryDB view.
 *
 * @interface
 * @property {string} name - Table name should match the name of the GerryDB table in Postgres and name of the layer in the tileset.
 * @property {string} tiles_s3_path - the path to the tiles in the S3 bucket
 */
export interface gerryDBView {
  name: string;
  tiles_s3_path: string;
}

/**
 * Get available GerryDB views from the server.
 * @param limit - number, the number of views to return (default 10, max 100)
 * @param offset - number, the number of views to skip (default 0)
 * @returns Promise
 */
export const getGerryDBViews: (
  limit?: number,
  offset?: number
) => Promise<gerryDBView[]> = async (limit = 10, offset = 0) => {
  return await axios
    .get(
      `${process.env.NEXT_PUBLIC_API_URL}/api/gerrydb/views?limit=${limit}&offset=${offset}`
    )
    .then((res) => {
      return res.data;
    });
};

const useSessionData = (sessionId: string) => {
  const query = useQuery({ queryKey: [sessionId], queryFn: getMapObject });

  return query;
};

export interface Assignment {
  document_id: string;
  geo_id: string;
  zone: number;
}
/**
 *
 * @param assignments
 * @returns server object containing the updated assignments per geoid
 */
const patchUpdateAssignments: (
  assignments: Assignment[]
) => Promise<responseObject> = async (assignments: Assignment[]) => {
  try {
    console.log("assignments", assignments);
    const returnObject = await axios
      .patch(`${process.env.NEXT_PUBLIC_API_URL}/api/update_assignments`, {
        assignments: assignments,
      })
      .then((res) => {
        return res.data;
      });
    return { data: returnObject };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error("Axios error:", error.message);
      if (error.response) {
        console.error("Response data:", error.response.data);
        console.error("Response status:", error.response.status);
        console.error("Response headers:", error.response.headers);
      }
    } else {
      console.error("Unexpected error:", error);
    }
    throw error;
  }
};
