import { LngLatLike } from "maplibre-gl";
import type { MapOptions } from "maplibre-gl";

const PUBLIC_MAPTILER_API_KEY = "WlatIY6MghFCwInJhBkl";
const MAPTILER_API = process.env.NEXT_PUBLIC_MAP_API || PUBLIC_MAPTILER_API_KEY;

export const MAP_TILES = `https://api.maptiler.com/maps/dataviz/style.json?key=${MAPTILER_API}`;
export const MAP_CENTER: LngLatLike = [-105.358887, 39.113014]; // colorado

export const MAP_OPTIONS: MapOptions = {
  style: MAP_TILES,
  zoom: 6.75,
  center: MAP_CENTER,
  maxZoom: 22,
  minZoom: 3,
  bearing: 0,
  pitch: 0,
  container: "",
};
