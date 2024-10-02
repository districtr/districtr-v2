import { debounce } from "lodash";
import {
  Assignment,
  FormatAssignments,
  getAssignments,
} from "../utils/api/apiHandlers";
import { patchUpdates } from "../utils/api/mutations";
import { useMapStore as _useMapStore, MapStore } from "./mapStore";

const zoneUpdates = ({
  mapRef,
  zoneAssignments,
  appLoadingState,
}: Partial<MapStore>) => {
  if (
    mapRef?.current &&
    zoneAssignments?.size &&
    appLoadingState === "loaded"
  ) {
    const assignments = FormatAssignments();
    patchUpdates.mutate(assignments);
  }
};
const debouncedZoneUpdate = debounce(zoneUpdates, 25);

export const getMapEditSubs = (useMapStore: typeof _useMapStore) => {
  const sendZonesOnMapRefSub = useMapStore.subscribe(
    (state) => state.mapRef,
    () => {
      const { mapRef, zoneAssignments, appLoadingState } =
        useMapStore.getState();
      debouncedZoneUpdate({ mapRef, zoneAssignments, appLoadingState });
    }
  );
  const sendZonesOnZonesSub = useMapStore.subscribe(
    (state) => state.zoneAssignments,
    () => {
      const { mapRef, zoneAssignments, appLoadingState } =
        useMapStore.getState();
      debouncedZoneUpdate({ mapRef, zoneAssignments, appLoadingState });
    }
  );
  const fetchAssignmentsSub = useMapStore.subscribe(
    (state) => state.mapDocument,

    (mapDocument) => {
      if (mapDocument) {
        const loadZoneAssignments = useMapStore.getState().loadZoneAssignments;
        console.log("fetching assignments");
        getAssignments(mapDocument).then((res: Assignment[]) => {
          console.log("got", res.length, "assignments");
          loadZoneAssignments(res);
        });
      }
    }
  );

  return [sendZonesOnMapRefSub, sendZonesOnZonesSub, fetchAssignmentsSub];
};
