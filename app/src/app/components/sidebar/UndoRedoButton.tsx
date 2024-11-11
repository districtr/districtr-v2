import { useMapStore, type MapStore } from "@/app/store/mapStore";
import { Button } from "@radix-ui/themes";
import { ResetIcon } from "@radix-ui/react-icons";
import type { TemporalState } from "zundo";
import { useStore } from "zustand";

/* convert zundo to a React hook */
const useTemporalStore = <T,>(
  selector: (state: TemporalState<MapStore>) => T,
  equality?: (a: T, b: T) => boolean,
) => useStore(useMapStore.temporal, selector, equality);

export function UndoRedoButton({ isRedo = false }) {
  const { futureStates, pastStates, redo, undo } = useTemporalStore(
    (state) => state,
  ); // TemporalState<MapStore>

  const handleClickUndoRedo = () => {
    if (isRedo) {
      redo();
    } else {
      undo();
    }
  };

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
