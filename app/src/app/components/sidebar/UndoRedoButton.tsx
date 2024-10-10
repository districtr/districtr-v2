import { BLOCK_SOURCE_ID } from "@/app/constants/layers";
import { Zone } from "@/app/constants/types";
import { useMapStore } from "@/app/store/mapStore";
import { Button } from "@radix-ui/themes";
import { ResetIcon } from "@radix-ui/react-icons";

export function UndoRedoButton({ isRedo = false }) {
  const mapStore = useMapStore.getState();

  const handleClickUndoRedo = () => {
    if (isRedo) {
      mapStore.undoCursor++;
    }
    const lastAction = mapStore.recentZoneAssignments[mapStore.undoCursor];
    if (!isRedo) {
      mapStore.undoCursor--;
    }
    const sourceLayer = mapStore.selectedLayer?.name;
    const restoreMap: { [id: number]: Set<string> } = {};
    const nullList = new Set<string>();
    lastAction.forEach((zones, geoid) => {
      const zone = zones[isRedo ? 1 : 0];
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
    Object.keys(restoreMap).forEach((numericZone: string) =>
      mapStore.setZoneAssignments(
        Number(numericZone),
        restoreMap[Number(numericZone)],
        true,
      ),
    );
  };

  return (
    <Button
      onClick={handleClickUndoRedo}
      variant="outline"
      disabled={
        isRedo
          ? mapStore.recentZoneAssignments.length === 0 ||
            mapStore.undoCursor >= mapStore.recentZoneAssignments.length - 1
          : mapStore.undoCursor < 0
      }
    >
      <div style={{ transform: isRedo ? "rotateY(180deg)" : "" }}>
        <ResetIcon />
      </div>
      {isRedo ? "Redo" : "Undo"}
    </Button>
  );
}
