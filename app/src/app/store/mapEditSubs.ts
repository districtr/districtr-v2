import { debounce } from "lodash";
import {
  Assignment,
  FormatAssignments,
  getAssignments,
} from "../utils/api/apiHandlers";
import { patchUpdates } from "../utils/api/mutations";
import { useMapStore as _useMapStore, MapStore } from "./mapStore";
import { shallowCompareArray } from "../utils/helpers";

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
    (state) => [state.mapRef, state.zoneAssignments],
    () => {
      const { mapRef, zoneAssignments, appLoadingState } =
        useMapStore.getState();
      debouncedZoneUpdate({ mapRef, zoneAssignments, appLoadingState });
    },
    { equalityFn: shallowCompareArray}
  );

  const fetchAssignmentsSub = useMapStore.subscribe(
    (state) => state.mapDocument,
    (mapDocument) => {
      if (mapDocument) {
        getAssignments(mapDocument).then((res: Assignment[]) => {
          useMapStore.getState().loadZoneAssignments(res);
        });
      }
    }
  );

  return [sendZonesOnMapRefSub, fetchAssignmentsSub];
};
