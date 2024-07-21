import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import type { Map } from "maplibre-gl";

/**
 * Hook to save map data to the server, using a mutation.
 * Should be agnostic to the mutationFn used.
 * @returns mutation to be used in calling hook component
 */
export const usePostMapData = () => {
  const mutation = useMutation({
    mutationFn: postMapObject,
    onMutate: (variables) => {
      // A mutation is about to happen, prepare for transaction
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
      // Error or success... doesn't matter!
      console.log(`Optimistic update with id ${context?.id} settled: `);
      if (error) {
        console.log("Error: ", error);
      }
      if (data) {
        console.log("Data: ", data);
      }
    },
  });

  return mutation;
};

/**
 * Save map data to the server.
 * @param mapObject - Map, the map object to save. In this case, the entire maplibre map object.
 * @returns Promise
 */
const postMapObject = async (mapObject: Map) => {
  // return axios.post("/saveMap", mapObject);
  console.log("should be saving map now");
  return { data: "Map saved!" };
};
