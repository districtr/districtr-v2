import { useRouter } from "next/router";
import { useCreateMapDocument } from "../api/apiHandlers";
import { useMapStore } from "../store/mapStore";

export const CreateMapSession = () => {
  // not actually doing anything right now
  const router = useRouter();
  // const createMapDocument = useCreateMapDocument();

  // createMapDocument.mutate();
  router.push(`/s/${useMapStore.getState().documentId}`);
};
