import { NullableZone } from "../constants/types";

export type DistrictrMapOptions = {
  showBrokenDistricts?: boolean;
  lockPaintedAreas: boolean | Array<NullableZone>;
  mode: "default" | "break"
};
