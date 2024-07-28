import { useRouter } from "next/router";
import { useCreateMapDocument } from "../api/apiHandlers";
import { useMapStore } from "../store/mapStore";

export const CreateMapSession = () => {
  const router = useRouter();
  const createMapDocument = useCreateMapDocument();

  createMapDocument.mutate();
  router.push(`/s/${useMapStore.getState().uuid}`);
};
