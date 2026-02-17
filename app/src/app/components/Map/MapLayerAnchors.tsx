import type React from 'react';
import {Layer, Source} from 'react-map-gl/maplibre';
import {EMPTY_FT_COLLECTION, LABELS_BREAK_LAYER_ID} from '@/app/constants/layers';

/** Define a constant array of anchor layer IDs, which are used for deterministic map draw ordering.
 *
 * NOTE: The convention for this file is that layers rendered above other layers are placed
 * first in the order, so that the `beforeId` references are always to layers declared later.
 * This is not a technical requirement but is intended to make it easier to reason
 * about the layer ordering when reading the code.
 */
export const MAP_LAYER_ANCHORS = {
  hover: 'anchor-hover',
  overlays: 'anchor-overlays',
  geometryOutline: 'anchor-geometry-outline',
  demography: 'anchor-demography',
  assignments: 'anchor-assignments',
  counties: 'anchor-counties',
} as const;

const ANCHOR_IDS = [
  MAP_LAYER_ANCHORS.hover,
  MAP_LAYER_ANCHORS.overlays,
  MAP_LAYER_ANCHORS.geometryOutline,
  MAP_LAYER_ANCHORS.demography,
  MAP_LAYER_ANCHORS.assignments,
  MAP_LAYER_ANCHORS.counties,
] as const;

/**
 *
 * Invisible anchor layers used only for deterministic map draw ordering.
 *
 * These layers render nothing (empty GeoJSON source + `visibility: 'none'`),
 * but expose stable layer IDs that other components target via `beforeId`.
 * This prevents z-order from depending on React mount timing.
 * Keep this mounted before layer groups that reference `anchor-*` IDs.
 *
 *
 * NOTE: The geometry data is set to an empty GeoJSON collection, and the visibility of the
 * layers is set to 'none' to ensure low overhead.
 */
export const MapLayerAnchors: React.FC = () => {
  return (
    <Source id="map-order-anchors" type="geojson" data={EMPTY_FT_COLLECTION}>
      {ANCHOR_IDS.map((id, i) => (
        <Layer
          key={id}
          id={id}
          type="symbol"
          source="map-order-anchors"
          beforeId={i === 0 ? LABELS_BREAK_LAYER_ID : ANCHOR_IDS[i - 1]}
          layout={{visibility: 'none'}}
        />
      ))}
    </Source>
  );
};
