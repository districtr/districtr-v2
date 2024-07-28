import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import type { Map } from "maplibre-gl";
import { useMapStore } from "@/app/store/mapStore";

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
      }
    },
  });

  return mutation;
};

interface responseObject {
  data: any;
}

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

const createMapObject: (mapObject: Map) => Promise<responseObject> = async (
  mapObject: Map
) => {
  try {
    const returnObject = await axios
      .post("http://127.0.0.1:8000/create_document") // should replace with env var
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
