import { useMapStore } from "@/app/store/mapStore";
import { Button } from "@radix-ui/themes";
import { ResetIcon } from "@radix-ui/react-icons";
import type { TemporalState } from "zundo";

export function UndoRedoButton({ isRedo = false }) {
  const mapStore = useMapStore.getState() as TemporalState;

  const handleClickUndoRedo = () => {
    if (isRedo) {
      mapStore.redo(1);
    } else {
      mapStore.undo(1);
    }
  };

  return (
    <Button
      onClick={handleClickUndoRedo}
      variant="outline"
      disabled={
        isRedo
          ? mapStore.futureStates.length === 0
          : mapStore.pastStates.length === 0
      }
    >
      <div style={{ transform: isRedo ? "rotateY(180deg)" : "" }}>
        <ResetIcon />
      </div>
      {isRedo ? "Redo" : "Undo"}
    </Button>
  );
}
