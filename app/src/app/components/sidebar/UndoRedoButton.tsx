import { Button } from "@radix-ui/themes";
import { ResetIcon } from "@radix-ui/react-icons";
import { useMapStore, type MapStore } from "@/app/store/mapStore";
import { useTemporalStore } from "@/app/store/temporalStore";

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
