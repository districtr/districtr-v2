import {MAP_LAYER_ANCHOR_IDS} from './layerIds';

/**
 * Shared contracts for parent/child polygon layer composition and ordering.
 */
export type BlockLayerOrder = {
  backgroundBeforeId: string;
  zoneBeforeId: string;
  demographyBeforeId: string;
  hoverBeforeId: string;
  outlineBeforeId: string;
};

export type ParentChildBlockLayerOrder = {
  parent: BlockLayerOrder;
  child: BlockLayerOrder;
};

export const DEFAULT_BLOCK_LAYER_ORDER: BlockLayerOrder = {
  backgroundBeforeId: MAP_LAYER_ANCHOR_IDS.assignments,
  zoneBeforeId: MAP_LAYER_ANCHOR_IDS.assignments,
  demographyBeforeId: MAP_LAYER_ANCHOR_IDS.demography,
  hoverBeforeId: MAP_LAYER_ANCHOR_IDS.hover,
  outlineBeforeId: MAP_LAYER_ANCHOR_IDS.overlays,
};

export const DEFAULT_PARENT_CHILD_BLOCK_LAYER_ORDER: ParentChildBlockLayerOrder = {
  parent: {...DEFAULT_BLOCK_LAYER_ORDER},
  child: {...DEFAULT_BLOCK_LAYER_ORDER},
};

/**
 * Anchor layers from top -> bottom.
 */
export const MAP_LAYER_ANCHOR_ORDER = [
  MAP_LAYER_ANCHOR_IDS.hover,
  MAP_LAYER_ANCHOR_IDS.overlays,
  MAP_LAYER_ANCHOR_IDS.geometryOutline,
  MAP_LAYER_ANCHOR_IDS.demography,
  MAP_LAYER_ANCHOR_IDS.assignments,
  MAP_LAYER_ANCHOR_IDS.counties,
] as const;

export const UNASSIGNED_BACKGROUND_OPACITY = {
  parent: 0.18,
  child: 0.22,
} as const;
