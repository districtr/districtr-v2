import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import type { Map } from "maplibre-gl";
import { useMapStore } from "@/app/store/mapStore";
import { use } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
      alert("Map created!: " + data.data);
      router.push(`/s/${data.data}`);
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

const getMapObject: QueryFunction<responseObject, [string]> = async (
  sessionId
) => {
  try {
    const returnObject = await axios
      .get(
        `http://${process.env.NEXT_PUBLIC_API_URL}/get_document/${sessionId}`
      )
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

const createMapObject: () => Promise<responseObject> = async () => {
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

export const CreateMapSession = () => {
  const router = useRouter();
  const createMapDocument = useCreateMapDocument();

  createMapDocument.mutate();
  router.push(`/session/${useMapStore.getState().documentId}`);
};
