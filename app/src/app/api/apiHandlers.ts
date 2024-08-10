import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { useMapStore } from "@/app/store/mapStore";

/**
 * Hook to save map data to the server, using a mutation.
 * @returns mutation to be used in calling hook component, e.g. localMutationVar.mutate()
 */
export const usePatchAssignments = () => {
  const mutation = useMutation({
    mutationFn: patchAssignments,
    onError: (error, variables, context) => {
      console.log("Could not update assignments", error);
    },
    onSuccess: (data, variables, context) => {
      console.log("Mutation successful!", data);
    },
    onSettled: (data, error, variables, context) => {
      // fires regardless of error or success
      if (error) {
        console.log("Error settling: ", error);
      }
    },
  });

  return mutation;
};

/**
 * Atomic assignment in model to send to server
 * @param document_id - uuid of the document to update
 * @param geo_id - id of the geo object to update (path in tiles)
 * @param zone - zone to assign to the geo object
 */
export interface Assignment {
  document_id: string;
  geo_id: string;
  zone: number;
}

const patchAssignments: (
  assignments: Assignment[],
) => Promise<ResponseObject> = async (assignments: Assignment[]) => {
  return await axios
    .post(`${process.env.NEXT_PUBLIC_API_URL}/api/updateAssignments`, {
      assignments: assignments, // Will need to add this in
    }) // should replace with env var
    .then((res) => {
      // successful roundtrip; return the document id
      return res.data.document_id;
    })
    .catch((error) => {
      console.error("Error creating map object: ", error);
    });
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
      console.log(`Rolling back optimistic update with id ${context?.id}`);
    },
    onSuccess: (data, variables, context) => {
      console.log(`Mutation ${context.id} successful!`, data);
    },
    onSettled: (data, error, variables, context) => {
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

interface ResponseObject {
  data: any;
}

const createMapObject: (
  gerrydb_table: string,
) => Promise<ResponseObject> = async (gerrydb_table: string) => {
  console.log("creating new document");
  return await axios
    .post(`${process.env.NEXT_PUBLIC_API_URL}/api/create_document`, {
      gerrydb_table: gerrydb_table,
    }) // should replace with env var
    .then((res) => {
      console.log("created document", res.data);
      // successful roundtrip; return the document id
      return res.data.document_id;
    })
    .catch((error) => {
      console.error("Error creating map object: ", error);
    });
};

/**
 * GerryDB view.
 *
 * @interface
 * @property {string} name - Table name should match the name of the GerryDB table in Postgres and name of the layer in the tileset.
 * @property {string} tiles_s3_path - the path to the tiles in the S3 bucket
 */
export interface GerryDBView {
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
  offset?: number,
) => Promise<GerryDBView[]> = async (limit = 10, offset = 0) => {
  console.log("Fetching GerryDB views...");
  return await axios
    .get(
      `${process.env.NEXT_PUBLIC_API_URL}/api/gerrydb/views?limit=${limit}&offset=${offset}`,
    )
    .then((res) => {
      return res.data;
    })
    // In axios do we need to catch the error ourselves? Seems like tanstack might do this for us
    .catch((error) => {
      console.error("Error fetching GerryDB views:", error);
      throw error;
    });
};
