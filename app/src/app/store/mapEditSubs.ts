import { debounce } from "lodash";
import {
  Assignment,
  FormatAssignments,
  getAssignments,
} from "../utils/api/apiHandlers";
import { patchUpdates } from "../utils/api/mutations";
import { useMapStore as _useMapStore, MapStore } from "./mapStore";
import { shallowCompareArray } from "../utils/helpers";
import { updateAssignments } from "../utils/api/queries";

const zoneUpdates = ({
  getMapRef,
  zoneAssignments,
  appLoadingState,
}: Partial<MapStore>) => {
  if (
    getMapRef?.() &&
    (zoneAssignments?.size) &&
    appLoadingState === "loaded"
  ) {
    const assignments = FormatAssignments();
    patchUpdates.mutate(assignments);
  }
};
const debouncedZoneUpdate = debounce(zoneUpdates, 25);

export const getMapEditSubs = (useMapStore: typeof _useMapStore) => {
  const sendZonesOnMapRefSub = useMapStore.subscribe(
    (state) => [state.getMapRef, state.zoneAssignments],
    () => {
      const { getMapRef, zoneAssignments, appLoadingState } =
        useMapStore.getState();
      debouncedZoneUpdate({ getMapRef, zoneAssignments, appLoadingState });
    },
    { equalityFn: shallowCompareArray}
  );

  const fetchAssignmentsSub = useMapStore.subscribe(
    (state) => state.mapDocument,
    (mapDocument) => mapDocument && updateAssignments(mapDocument)
  );

  return [sendZonesOnMapRefSub, fetchAssignmentsSub];
};
