import { useCallback } from "react";
import { useMapStore, type MapStore } from "@/app/store/mapStore";
import { Button } from "@radix-ui/themes";
import { ResetIcon } from "@radix-ui/react-icons";
import type { TemporalState } from "zundo";

export function UndoRedoButton({ isRedo = false }) {
  const { futureStates, pastStates, redo, undo } = useMapStore.temporal.getState();
  // as TemporalState<MapStore>

  const handleClickUndoRedo = useCallback(() => {
    if (isRedo) {
      redo();
    } else {
      undo();
    }
  }, [redo, undo, isRedo]);

  return (
    <Button
      onClick={handleClickUndoRedo}
      variant="outline"
      disabled={
        isRedo
          ? futureStates.length === 0
          : pastStates.length === 0
      }
    >
      <div style={{ transform: isRedo ? "rotateY(180deg)" : "" }}>
        <ResetIcon />
      </div>
      {isRedo ? "Redo" : "Undo"}
    </Button>
  );
}
