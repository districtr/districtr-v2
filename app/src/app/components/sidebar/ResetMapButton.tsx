import { useMapStore } from "@/app/store/mapStore";
import { Button } from "@radix-ui/themes";

export function ResetMapButton() {
  const handleReset = useMapStore(state => state.handleReset)

  return (
    <Button onClick={handleReset} variant={"outline"}>
      Reset Map
    </Button>
  );
}
