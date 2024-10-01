import { useLocalStorage } from "./useLocalStorage";

type MapInfo = {
  id: string
  edited: string
  name: string
}

type UseRecentMapsHook = () => {
  maps: MapInfo[],
  removeMap: (id: string) => void,
  upcertMap: (map: MapInfo) => void
}

export const useRecentMaps: UseRecentMapsHook = () => {
  const [maps, setMaps] = useLocalStorage<MapInfo[]>([], 'districtr-maps')
  const mapsSorted = maps.sort((a,b) => a.edited.localeCompare(b.edited))

  const removeMap = (id: string) => {
    setMaps(prev => prev.filter(f => f.id !== id))
  }
  const upcertMap = (info: MapInfo) => {
    setMaps(prev => {
      const existingIndex = prev.findIndex(map => map.id === info.id);
      if (existingIndex !== -1) {
        // Update existing map
        const updatedMaps = [...prev];
        updatedMaps[existingIndex] = info;
        return updatedMaps;
      } else {
        // Insert new map at the beginning
        return [info, ...prev];
      }
    });
  }
  return {
    maps: mapsSorted,
    removeMap,
    upcertMap
  }
}