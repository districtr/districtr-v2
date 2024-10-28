import { debounce } from "lodash";
import {
  Assignment,
  FormatAssignments,
  getAssignments,
  patchUnShatterParents,
} from "../utils/api/apiHandlers";
import { patchUnShatter, patchUpdates } from "../utils/api/mutations";
import { useMapStore as _useMapStore, MapStore } from "./mapStore";
import { shallowCompareArray } from "../utils/helpers";
import { updateAssignments } from "../utils/api/queries";
import { NullableZone } from "../constants/types";

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

const findAssignmentMode = (
  zoneAssignments: MapStore['zoneAssignments'], 
  ids: Set<string>
) => {
  const counts = new Map<number|null, number>()
  ids.forEach(id => {
    const assignment = zoneAssignments.get(id) || null
    const newCount = (counts.get(assignment) || 0) + 1
    counts.set(assignment, newCount)
  })
  // find max 
  return Array.from(counts.entries()).reduce((acc, curr: any) => {
    const currentIsMore = curr[1] > acc.count
    return {
      count: currentIsMore ? curr[1] : acc.count,
      zone: currentIsMore ? curr[0] : acc.zone
    }
  }, {
    zone: -999,
    count: 0
  });
}

type zoneSubState = [
  MapStore['getMapRef'],
  MapStore['zoneAssignments'],
  MapStore['appLoadingState'],
  MapStore['mapRenderingState']
]
export const getMapEditSubs = (useMapStore: typeof _useMapStore) => {
  const sendZonesOnMapRefSub = useMapStore.subscribe<zoneSubState>(
    (state) => [state.getMapRef, state.zoneAssignments, state.appLoadingState, state.mapRenderingState],
    ([getMapRef, zoneAssignments, appLoadingState, mapRenderingState], [ _prevMapRef, _prevZoneAssignments, prevAppLoadingState, prevMapRenderingState]) => {
      const previousNotLoaded = [appLoadingState, mapRenderingState, prevAppLoadingState, prevMapRenderingState].some(state => state !== 'loaded')
      if (!getMapRef() || previousNotLoaded) {
        return
      }

      console.log("!!!SENDING UPDATES", appLoadingState, mapRenderingState, prevAppLoadingState, prevMapRenderingState)

      const unshatterParentsPromise = new Promise((resolve, reject) => {
        const {shatterMappings, mapDocument, removeShatters, activeTool, selectedZone} = useMapStore.getState();
        if (!mapDocument?.document_id){
          return
        }
        const zoneKeys = Array.from(zoneAssignments.keys());
        let parentsToUnshatter = [];
        let childrenToRemove = []
        let parentZones: Record<string,number> = {}

        for (const key of Object.keys(shatterMappings)) {
          if (zoneKeys.includes(key) && zoneAssignments.get(key) !== null) {
            parentsToUnshatter.push(key);
            parentZones[key] = findAssignmentMode(zoneAssignments, shatterMappings[key]).zone
            childrenToRemove.push(shatterMappings[key])
            // get mode of zoneAssignments for all children

            shatterMappings[key]
          }
        }
        
        
        if (parentsToUnshatter.length) {
          // TODO, on undo-redo, but brush is
          const zone = activeTool === 'brush' ? selectedZone : parentZones[parentsToUnshatter[0]]
          // remove from zone assignments
          childrenToRemove.forEach(childSet => childSet.forEach(childId => zoneAssignments.delete(childId)))
          // remove shatter data from store
          useMapStore.getState().removeShatters(parentsToUnshatter)
          // do mutation
          patchUnShatter.mutate({
            geoids: parentsToUnshatter,
            zone,
            document_id: mapDocument.document_id
          }).then(() => {
            resolve(true)
          })
        } else {
          resolve(true)
        }
      })

      unshatterParentsPromise.then(() => {
        debouncedZoneUpdate({ getMapRef, zoneAssignments, appLoadingState });
      })
    },
    { equalityFn: shallowCompareArray}
  );

  const fetchAssignmentsSub = useMapStore.subscribe(
    (state) => state.mapDocument,
    (mapDocument) => mapDocument && updateAssignments(mapDocument)
  );

  return [sendZonesOnMapRefSub, fetchAssignmentsSub];
};
