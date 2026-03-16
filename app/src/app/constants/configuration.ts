import {LngLatLike} from 'maplibre-gl';
import type {MapOptions} from 'maplibre-gl';
import {BASEMAP_IDS, type BasemapId} from '@/app/constants/map/layerStyle';
import { GEODATA_URL } from '../utils/api/constants';

export const MAP_CENTER: LngLatLike = [-98.5556199, 39.8097343]; // kansas
const MAPSTYLE_ROOT_URL = process.env.NODE_ENV === 'development' ? '' : GEODATA_URL
const MAPSTYLE_SUFFIX = process.env.NODE_ENV === 'development' ? '' : '';
export const MINIMAL_BASEMAP_STYLE_URL = `${MAPSTYLE_ROOT_URL}/basemaps/minimal-basemap-style.json${MAPSTYLE_SUFFIX}`;
export const STREETS_BASEMAP_STYLE_URL = `${MAPSTYLE_ROOT_URL}/basemaps/streets-basemap-style.json${MAPSTYLE_SUFFIX}`;
export const SATELLITE_BASEMAP_STYLE_URL = `${MAPSTYLE_ROOT_URL}/basemaps/satellite-basemap-style.json${MAPSTYLE_SUFFIX}`;

/**
 * Returns the URL to the basemap style JSON for the given basemap.
 */
export const getMapStyleForBasemap = (basemap: BasemapId): string => {
  switch (basemap) {
    case BASEMAP_IDS.MINIMAL:
      return MINIMAL_BASEMAP_STYLE_URL;
    case BASEMAP_IDS.STREETS:
      return STREETS_BASEMAP_STYLE_URL;
    case BASEMAP_IDS.SATELLITE:
      return SATELLITE_BASEMAP_STYLE_URL;
    default:
      return MINIMAL_BASEMAP_STYLE_URL;
  }
};

export const MAP_OPTIONS: MapOptions = {
  zoom: 3.75,
  center: MAP_CENTER,
  maxZoom: 22,
  minZoom: 3,
  bearing: 0,
  pitch: 0,
  container: '',
};

/**
 * locally defined variable in the original codebase;
 * purpose is to only count drag select movements greater
 * than this threshold.
 * @type {number}
 */
export const offsetFactor: number = 15;

/** Minimum milliseconds between undo/redo history snapshots. */
export const MIN_DIFF_MS = 3000;

/** Maximum number of undo/redo history states to keep per store. */
export const TEMPORAL_HISTORY_LIMIT = 20;
