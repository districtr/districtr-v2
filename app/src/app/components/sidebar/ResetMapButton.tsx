import { useMapStore } from "@/app/store/mapStore";
import { useEffect } from "react";

export function ResetMapButton() {
  const { setFreshMap } = useMapStore((state) => ({
    setFreshMap: state.setFreshMap,
  }));

  const handleClickResetMap = () => {
    setFreshMap(true);
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
