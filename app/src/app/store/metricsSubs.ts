import { updateMapMetrics } from "../utils/api/queries";
import { useMapStore as _useMapStore } from "./mapStore";

export const getMapMetricsSubs = (useMapStore: typeof _useMapStore) => {

  const mapMetricsSub = useMapStore.subscribe(
    (state) => state.mapDocument,
    (mapDocument) => {
      if (mapDocument) {
        updateMapMetrics(mapDocument);
      }
    }
  );
  return [
    mapMetricsSub
  ]
}
