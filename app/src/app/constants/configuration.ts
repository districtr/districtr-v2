import {LngLatLike} from 'maplibre-gl';
import type {MapOptions, StyleSpecification} from 'maplibre-gl';
import {MINIMAL_BASEMAP_LAYERS} from './map/minimalBasemapLayers';
import {STREETS_BASEMAP_LAYERS} from './map/streetsBasemapLayers';
import {SATELLITE_BASEMAP_LAYERS} from './map/satelliteBasemapLayers';
import {GEODATA_URL, MAPTILER_API_KEY} from '../utils/api/constants';
import {BASEMAP_IDS, type BasemapId} from '@/app/constants/map/layerStyle';

export const MAP_CENTER: LngLatLike = [-98.5556199, 39.8097343]; // kansas

export const MINIMAL_BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    protomaps: {
      type: 'vector',
      attribution:
        '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      url: `pmtiles://${GEODATA_URL}/basemaps/20240325.pmtiles`,
    },
  },
  layers: MINIMAL_BASEMAP_LAYERS,
  glyphs: `${GEODATA_URL}/fonts/{fontstack}/{range}.pbf`,
  sprite: `${GEODATA_URL}/sprites/white`,
};
export const STREETS_BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    protomaps: {
      type: 'vector',
      attribution:
        '<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      url: `pmtiles://${GEODATA_URL}/basemaps/20240325.pmtiles`,
    },
  },
  layers: STREETS_BASEMAP_LAYERS,
  glyphs: `${GEODATA_URL}/fonts/{fontstack}/{range}.pbf`,
  sprite: `${GEODATA_URL}/sprites/white`,
};

export const SATELLITE_BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "maptiler_planet": {
      "url": `https://api.maptiler.com/tiles/v4/tiles.json?key=${MAPTILER_API_KEY}`,
      "type": "vector"
    },
    "satellite": {
      "url": `https://api.maptiler.com/tiles/satellite-v2/tiles.json?key=${MAPTILER_API_KEY}`,
      "type": "raster"
    }
  },
  layers: SATELLITE_BASEMAP_LAYERS,
  "glyphs": `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${MAPTILER_API_KEY}`,
  "sprite": "https://api.maptiler.com/maps/019c779b-d342-786b-8c27-dbb8dcf385c2/sprite",
};

/**
 * Returns the map style for the given basemap. Minimal uses the local Protomaps
 * style; Streets and Satellite use MapTiler (stub URLs – styles can be updated manually).
 */
export const getMapStyleForBasemap = (basemap: BasemapId) => {
  switch (basemap) {  
    case BASEMAP_IDS.MINIMAL:
      return MINIMAL_BASEMAP_STYLE;
    case BASEMAP_IDS.STREETS:
      return STREETS_BASEMAP_STYLE;
    case BASEMAP_IDS.SATELLITE:
      return SATELLITE_BASEMAP_STYLE;
    default:
      return MINIMAL_BASEMAP_STYLE;
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
