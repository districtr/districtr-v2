import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import type { Map } from "maplibre-gl";
import { useMapStore } from "@/app/store/mapStore";
import { SetUpdateUrlParams } from "../utils/events/mapEvents";
import type { QueryFunction } from "@tanstack/react-query";

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
        useMapStore.setState({ documentId: data.data });
      }
    },
  });

  return mutation;
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
        useMapStore.setState({ documentId: data.data });
        // add document id to search params store item
        const { router, pathname, urlParams } = useMapStore.getState();
        urlParams.set("document_id", data.data);
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

interface responseObject {
  data: any;
}

const createMapObject: (mapObject: Map) => Promise<responseObject> = async (
  mapObject: Map
) => {
  try {
    const returnObject = await axios
      .post(`${process.env.NEXT_PUBLIC_API_URL}/api/create_document`, {
        gerrydb_table: null, // Will need to add this in
      }) // should replace with env var
      .then((res) => {
        // successful roundtrip; return the document id
        return res.data.document_id;
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

export const getMapObject: QueryFunction<
  responseObject,
  [string]
> = async () => {
  const documentId = useMapStore.getState().documentId;
  try {
    const returnObject = await axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/get_assignments/${documentId}`)
      .then((res) => {
        console.log("i got the data", res.data);
        return res.data;
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
  try {
    const returnObject = await axios
      .get(
        `${process.env.NEXT_PUBLIC_API_DEV_URL}/api/gerrydb/views?limit=${limit}&offset=${offset}`
      )
      .then((res) => {
        return res.data;
      });
    return returnObject;
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

const useSessionData = (sessionId: string) => {
  const query = useQuery({ queryKey: [sessionId], queryFn: getMapObject });

  return query;
};

/**
 * Save map data to the server.
 * @param mapObject - Map, the map object to save. In this case, the entire maplibre map object.
 * @returns Promise
 */
const postMapObject: (mapObject: Map) => Promise<responseObject> = async (
  mapObject: Map
) => {
  // return axios.post("/saveMap", mapObject);
  console.log("should be saving map now");
  return { data: "Map saved!" };
};
