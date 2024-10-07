import { BLOCK_SOURCE_ID } from "@/app/constants/layers";
import { Zone } from "@/app/constants/types";
import { useMapStore } from "@/app/store/mapStore";
import { Button } from "@radix-ui/themes";

export function UndoButton() {
  const mapStore = useMapStore.getState();

  const handleClickUndo = () => {
    const sourceLayer = mapStore.selectedLayer?.name;
    const lastAction = mapStore.recentZoneAssignments[mapStore.recentZoneAssignments.length - 1];
    const restoreMap: { [id: number]: Set<string> } = {};
    const nullList = new Set<string>();
    lastAction.forEach((zone, geoid) => {
      mapStore.mapRef?.current?.setFeatureState(
        {
          source: BLOCK_SOURCE_ID,
          id: geoid,
          sourceLayer,
        },
        { zone },
      );
      if (zone === null) {
        nullList.add(geoid);
      } else {
        if (!restoreMap[zone]) {
          restoreMap[zone] = new Set<string>();
        }
        restoreMap[zone].add(geoid);
      }
    });
    mapStore.setZoneAssignments(null, nullList, true);
    for (const numericZone in Object.keys(restoreMap)) {
      mapStore.setZoneAssignments(Number(numericZone), restoreMap[numericZone], true);
    }
    mapStore.recentZoneAssignments.pop();
  };

  return (
    <Button
      onClick={handleClickUndo}
      variant="outline"
      disabled={mapStore.recentZoneAssignments.length === 0}
    >
      ↺ Undo
    </Button>
  );
}
