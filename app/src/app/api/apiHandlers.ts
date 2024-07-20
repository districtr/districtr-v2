import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import type { Map } from "maplibre-gl";

/**
 * Save map data to the server, using a mutation.
 * Should be agnostic to the mutationFn used.
 * @returns void
 */
export const PostMapData = () => {
  useMutation({
    mutationFn: saveMap,
    onMutate: (variables) => {
      // A mutation is about to happen, prepare for transaction
      // return a context containing data to use when for example rolling back
      return {
        id:
          // optimistic
          Math.random().toString(36).substring(7),
      };
    },
    onError: (error, variables, context) => {
      // An error happened!
      console.log(`rolling back optimistic update with id ${context?.id}`);
    },
    onSuccess: async (data, variables, context) => {
      // Boom baby!
    },
    onSettled: async (data, error, variables, context) => {
      // Error or success... doesn't matter!
      console.log(`optimistic update with id ${context?.id} settled`);
    },
  });
};

/**
 * Save map data to the server.
 * @param mapObject - Map, the map object to save. In this case, the entire maplibre map object.
 * @returns Promise
 */
const saveMap = async (mapObject: Map) => {
  return axios.post("/saveMap", mapObject);
};
