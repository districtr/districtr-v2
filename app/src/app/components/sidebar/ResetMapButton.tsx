import { useMapStore } from "@/app/store/mapStore";

export function ResetMapButton() {
  const mapStore = useMapStore.getState();

  const handleClickResetMap = () => {
    mapStore.setFreshMap(true);
  };

  return (
    <button
      onClick={handleClickResetMap}
      className=" m-3 p-1.5 bg-white rounded-lg shadow-md"
    >
      Reset Map
    </button>
  );
}
