import { Button } from "@radix-ui/themes";
import { ResetIcon } from "@radix-ui/react-icons";
import type { TemporalState } from "zundo";
import { useStore } from "zustand";
import { useMapStore, type MapStore } from "@/app/store/mapStore";

/* convert zundo to a React hook */
const useTemporalStore = <T,>(
  selector: (state: TemporalState<Partial<MapStore>>) => T,
  equality?: (a: T, b: T) => boolean,
) => useStore(useMapStore.temporal, selector, equality);

export function UndoRedoButton({ isRedo = false }) {
  const { futureStates, pastStates, redo, undo } = useTemporalStore(
    (state) => state,
  ); // TemporalState<MapStore>
  const setIsTemporalAction = useMapStore(state => state.setIsTemporalAction)
  const handleClickUndoRedo = () => {
    setIsTemporalAction(true)
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
          : pastStates.filter((state) => 
            state.zoneAssignments?.size
            && state.appLoadingState === 'loaded'
            && state.mapRenderingState === 'loaded'
          ).length <= 1
      }
    >
      <div style={{ transform: isRedo ? "rotateY(180deg)" : "" }}>
        <ResetIcon />
      </div>
      {isRedo ? "Redo" : "Undo"}
    </Button>
  );
}
