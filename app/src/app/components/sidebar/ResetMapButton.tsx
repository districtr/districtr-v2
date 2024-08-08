import { useMapStore } from "@/app/store/mapStore";
import { Button } from "@radix-ui/themes";
export function ResetMapButton() {
  const mapStore = useMapStore.getState();

  const handleClickResetMap = () => {
    mapStore.setFreshMap(true);
  };

  return (
    <Button onClick={handleClickResetMap} variant={"outline"}>
      Reset Map
    </Button>
  );
}
