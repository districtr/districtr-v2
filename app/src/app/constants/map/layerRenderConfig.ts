import {MAP_LAYER_ANCHOR_IDS} from './layerIds';

export const DEFAULT_BLOCK_LAYER_ORDER = {
  backgroundBeforeId: MAP_LAYER_ANCHOR_IDS.assignments,
  zoneBeforeId: MAP_LAYER_ANCHOR_IDS.assignments,
  demographyBeforeId: MAP_LAYER_ANCHOR_IDS.demography,
  hoverBeforeId: MAP_LAYER_ANCHOR_IDS.hover,
  outlineBeforeId: MAP_LAYER_ANCHOR_IDS.geometryOutline,
};

/**
 * Canonical anchor layers from top -> bottom:
 * hover -> overlays -> demography -> assignments -> geometryOutline -> counties.
 */
export const MAP_LAYER_ANCHOR_ORDER = [
  MAP_LAYER_ANCHOR_IDS.hover,
  MAP_LAYER_ANCHOR_IDS.overlays,
  MAP_LAYER_ANCHOR_IDS.demography,
  MAP_LAYER_ANCHOR_IDS.assignments,
  MAP_LAYER_ANCHOR_IDS.geometryOutline,
  MAP_LAYER_ANCHOR_IDS.counties,
] as const;

export const UNASSIGNED_BACKGROUND_OPACITY = {
  parent: 0.18,
  child: 0.22,
} as const;
