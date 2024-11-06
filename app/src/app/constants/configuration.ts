"use client"
import { LngLatLike } from "maplibre-gl";
import type { MapOptions, StyleSpecification } from "maplibre-gl";
import { BASEMAP_LAYERS } from "./basemapLayers";
import { getBlocksSource } from "./sources";

export const MAP_CENTER: LngLatLike = [-98.5556199, 39.8097343]; // kansas

export const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    protomaps: {
      ...getBlocksSource("basemaps/20240325.pmtiles"),
      attribution:
      '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
    },
    counties: {
      ...getBlocksSource("basemaps/tiger/tiger2023/tl_2023_us_county_full.pmtiles"),
    },
  },
  layers: BASEMAP_LAYERS,
  glyphs: `${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/fonts/{fontstack}/{range}.pbf`,
  sprite: `${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/sprites/white`,
};

export const MAP_OPTIONS: MapOptions = {
  style: BASEMAP_STYLE,
  zoom: 3.75,
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
