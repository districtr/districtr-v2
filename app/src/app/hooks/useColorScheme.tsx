import { useMapStore } from "../store/mapStore";
import { colorScheme as DefaultColorScheme } from "@/app/constants/colors";

export const useColorScheme = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  return mapDocument?.color_scheme ?? DefaultColorScheme;
};