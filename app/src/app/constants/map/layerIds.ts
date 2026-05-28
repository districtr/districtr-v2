export const CANONICAL_LAYER_IDS = {
  SOURCES: {
    BLOCK: 'blocks',
    PUBLIC: 'public-districts',
    SELECTION_POINTS_PARENT: 'SELECTION_POINTS',
    SELECTION_POINTS_CHILD: 'SELECTION_POINTS_child',
    COUNTIES: 'counties',
    MAP_ORDER_ANCHORS: 'map-order-anchors',
    ZONE_LABEL: 'zone-label',
  },
  BREAKS: {
    LABELS: 'places_subplace',
  },
  MAP_ANCHORS: {
    HOVER: 'anchor-hover',
    OVERLAYS: 'anchor-overlays',
    GEOMETRY_OUTLINE: 'anchor-geometry-outline',
    DEMOGRAPHY: 'anchor-demography',
    ASSIGNMENTS: 'anchor-assignments',
    COUNTIES: 'anchor-counties',
  },
  OVERLAY: {
    SOURCE_PREFIX: 'overlay-source-',
    LAYER_PREFIX: 'overlay-layer-',
    CLICK_PREFIX: 'overlay-click-',
    SELECTED_PREFIX: 'overlay-selected-',
  },
  COUNTIES: {
    FILL: 'counties_fill',
    BOUNDARY: 'counties_boundary',
    LABELS: 'counties_labels',
  },
  BLOCK: {
    PARENT: {
      BASE: 'blocks',
      HOVER: 'blocks-hover',
      HIGHLIGHT: 'blocks-highlight',
      POINTS: 'blocks-points',
      OUTLINE: 'blocks-outline',
      BACKGROUND: 'blocks-hover-background',
    },
    CHILD: {
      BASE: 'blocks-child',
      HOVER: 'blocks-child-hover',
      HIGHLIGHT: 'blocks-highlight-child',
      POINTS: 'blocks-points-child',
      OUTLINE: 'blocks-child-outline',
      BACKGROUND: 'blocks-child-hover-background',
    },
  },
  PUBLIC: {
    FILL: 'public-district-fill',
    OUTLINE: 'public-district-outline',
  },
  ZONE_LABELS: {
    TEXT: 'ZONE_LABEL',
    BACKGROUND: 'ZONE_LABEL_BG',
    LOCK: 'ZONE_LOCK_LABEL',
    COMMENT_INDICATOR: 'ZONE_COMMENT_INDICATOR',
  },
} as const;

export type BlockScope = keyof typeof CANONICAL_LAYER_IDS.BLOCK;
// "PARENT" | "CHILD"

// These are included here so that the migration to new constants location does not
// break things
export const BLOCK_SOURCE_ID = CANONICAL_LAYER_IDS.SOURCES.BLOCK;
export const PUBLIC_SOURCE_ID = CANONICAL_LAYER_IDS.SOURCES.PUBLIC;
export const BLOCK_LAYER_ID = CANONICAL_LAYER_IDS.BLOCK.PARENT.BASE;
export const BLOCK_LAYER_ID_CHILD = CANONICAL_LAYER_IDS.BLOCK.CHILD.BASE;
export const BLOCK_POINTS_LAYER_ID = CANONICAL_LAYER_IDS.BLOCK.PARENT.POINTS;
export const BLOCK_POINTS_LAYER_ID_CHILD = CANONICAL_LAYER_IDS.BLOCK.CHILD.POINTS;
export const BLOCK_LAYER_ID_HIGHLIGHT_CHILD = CANONICAL_LAYER_IDS.BLOCK.CHILD.HIGHLIGHT;
export const BLOCK_HOVER_LAYER_ID = CANONICAL_LAYER_IDS.BLOCK.PARENT.HOVER;
export const BLOCK_HOVER_LAYER_ID_CHILD = CANONICAL_LAYER_IDS.BLOCK.CHILD.HOVER;

export const SELECTION_POINTS_SOURCE_ID = CANONICAL_LAYER_IDS.SOURCES.SELECTION_POINTS_PARENT;
export const SELECTION_POINTS_SOURCE_ID_CHILD = CANONICAL_LAYER_IDS.SOURCES.SELECTION_POINTS_CHILD;

export const COUNTY_SOURCE_ID = CANONICAL_LAYER_IDS.SOURCES.COUNTIES;

export const MAP_ORDER_ANCHORS_SOURCE_ID = CANONICAL_LAYER_IDS.SOURCES.MAP_ORDER_ANCHORS;

/** Define a constant array of anchor layer IDs, which are used for deterministic map draw ordering.
 *
 * NOTE: The convention for this file is that layers rendered above other layers are placed
 * first in the order, so that the `beforeId` references are always to layers declared later.
 * This is not a technical requirement but is intended to make it easier to reason
 * about the layer ordering when reading the code.
 */
export const MAP_LAYER_ANCHOR_IDS = {
  hover: CANONICAL_LAYER_IDS.MAP_ANCHORS.HOVER,
  overlays: CANONICAL_LAYER_IDS.MAP_ANCHORS.OVERLAYS,
  geometryOutline: CANONICAL_LAYER_IDS.MAP_ANCHORS.GEOMETRY_OUTLINE,
  demography: CANONICAL_LAYER_IDS.MAP_ANCHORS.DEMOGRAPHY,
  assignments: CANONICAL_LAYER_IDS.MAP_ANCHORS.ASSIGNMENTS,
  counties: CANONICAL_LAYER_IDS.MAP_ANCHORS.COUNTIES,
} as const;

export const LABELS_BREAK_LAYER_ID = CANONICAL_LAYER_IDS.BREAKS.LABELS;

export const ZONE_LABEL_SOURCE_ID = CANONICAL_LAYER_IDS.SOURCES.ZONE_LABEL;
export const ZONE_LABEL_LAYER_IDS = {
  TEXT: CANONICAL_LAYER_IDS.ZONE_LABELS.TEXT,
  BACKGROUND: CANONICAL_LAYER_IDS.ZONE_LABELS.BACKGROUND,
  LOCK: CANONICAL_LAYER_IDS.ZONE_LABELS.LOCK,
  COMMENT_INDICATOR: CANONICAL_LAYER_IDS.ZONE_LABELS.COMMENT_INDICATOR,
} as const;
export const ZONE_LABEL_LAYER_LIST: string[] = Object.values(ZONE_LABEL_LAYER_IDS);

export const GEOMETRY_OUTLINE_LAYER_IDS = {
  parent: CANONICAL_LAYER_IDS.BLOCK.PARENT.OUTLINE,
  child: CANONICAL_LAYER_IDS.BLOCK.CHILD.OUTLINE,
} as const;

export const OVERLAY_LAYER_ID_PREFIXES = {
  source: CANONICAL_LAYER_IDS.OVERLAY.SOURCE_PREFIX,
  layer: CANONICAL_LAYER_IDS.OVERLAY.LAYER_PREFIX,
  click: CANONICAL_LAYER_IDS.OVERLAY.CLICK_PREFIX,
  selected: CANONICAL_LAYER_IDS.OVERLAY.SELECTED_PREFIX,
} as const;

export const HOVER_LAYER_ID_SUFFIXES = {
  fill: '_demography_hover',
  line: '_line',
} as const;

export const getHoverLayerIds = (idBase: string) => ({
  fillId: `${idBase}${HOVER_LAYER_ID_SUFFIXES.fill}`,
  lineId: `${idBase}${HOVER_LAYER_ID_SUFFIXES.line}`,
});

export const INTERACTIVE_LAYERS: string[] = [
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  CANONICAL_LAYER_IDS.PUBLIC.FILL,
];
export const PARENT_LAYERS: string[] = [BLOCK_LAYER_ID, BLOCK_HOVER_LAYER_ID];
export const CHILD_LAYERS: string[] = [
  BLOCK_LAYER_ID_CHILD,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID_HIGHLIGHT_CHILD,
] as string[];
