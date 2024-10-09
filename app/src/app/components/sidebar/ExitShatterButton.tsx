import { useMapStore } from "@/app/store/mapStore";
import { Button } from "@radix-ui/themes";

export function ResetShatterViewButton() {
  const captiveIds = useMapStore(store => store.captiveIds);
  const resetShatterView = useMapStore(store => store.resetShatterView)

  return captiveIds.size ? (
    <Button onClick={resetShatterView} variant={"solid"} >
      Close Shatter View
    </Button>
  ) : null
}
