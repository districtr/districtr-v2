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

type zoneSubState = [
  MapStore['mapRef'],
  MapStore['zoneAssignments'],
  MapStore['appLoadingState'],
  MapStore['mapRenderingState']
]
export const getMapEditSubs = (useMapStore: typeof _useMapStore) => {
  const sendZonesOnMapRefSub = useMapStore.subscribe<zoneSubState>(
    (state) => [state.mapRef, state.zoneAssignments, state.appLoadingState, state.mapRenderingState],
    ([mapRef, zoneAssignments, appLoadingState, mapRenderingState], [ _prevMapRef, _prevZoneAssignments, prevAppLoadingState, prevMapRenderingState]) => {
      const previousNotLoaded = [appLoadingState, mapRenderingState, prevAppLoadingState, prevMapRenderingState].some(state => state !== 'loaded')
      if (!mapRef || previousNotLoaded) {
        return
      }
      console.log("!!!SENDING UPDATES", appLoadingState, mapRenderingState, prevAppLoadingState, prevMapRenderingState)
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
