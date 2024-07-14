import type { MapOptions } from "maplibre-gl";
import { create } from "zustand";

export interface MapStore {
  mapOptions: MapOptions;
  setMapOptions: (options: MapOptions) => void;
}
