import { LngLatLike } from "maplibre-gl";
import type { MapOptions, StyleSpecification } from "maplibre-gl";
import * as basemapLayers from "./basemapLayers.json";

const BASEMAP_LAYERS = Array.from(basemapLayers);

export const MAP_CENTER: LngLatLike = [-105.358887, 39.113014]; // colorado

export const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    protomaps: {
      type: "vector",
      attribution:
        '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      url: `pmtiles://${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/basemaps/20240325.pmtiles`,
    },
    counties: {
      type: "vector",
      url: `pmtiles://${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/basemaps/tiger/tiger2023/tl_2023_us_county_full.pmtiles`,
    },
  },
  layers: BASEMAP_LAYERS,
  glyphs: `${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/fonts/{fontstack}/{range}.pbf`,
  sprite: `${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/sprites/white`,
};

export const MAP_OPTIONS: MapOptions = {
  style: BASEMAP_STYLE,
  zoom: 6.75,
  center: MAP_CENTER,
  maxZoom: 22,
  minZoom: 3,
  bearing: 0,
  pitch: 0,
  container: "",
};

/**
 * locally defined variable in the original codebase;
 * purpose is to only count drag select movements greater
 * than this threshold.
 * @type {number}
 */
export const offsetFactor: number = 15;
