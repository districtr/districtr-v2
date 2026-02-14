import {Layer, Source} from 'react-map-gl/maplibre';
import {EMPTY_FT_COLLECTION, LABELS_BREAK_LAYER_ID} from '@/app/constants/layers';

/**
 * Invisible anchor layers used only for deterministic map draw ordering.
 *
 * These layers render nothing (empty GeoJSON source + `visibility: 'none'`),
 * but expose stable layer IDs that other components target via `beforeId`.
 * This prevents z-order from depending on React mount timing.
 * Keep this mounted before layer groups that reference `anchor-*` IDs.
 *
 * NOTE: The convention for this file is that layers rendered above other layers are placed
 * first in the order, so that the `beforeId` references are always to layers declared later
 * in this file. This is not a technical requirement but is intended to make it easier to reason
 * about the layer ordering when reading the code.
 *
 * NOTE: The geometry data is set to an empty GeoJSON collection, and the visibility of the
 * layers is set to 'none' to ensure low overhead.
 */
export function MapLayerAnchors() {
  return (
    <Source id="map-order-anchors" type="geojson" data={EMPTY_FT_COLLECTION}>
      <Layer
        id="anchor-hover"
        type="symbol"
        source="map-order-anchors"
        beforeId={LABELS_BREAK_LAYER_ID}
        layout={{visibility: 'none'}}
      />
      <Layer
        id="anchor-demography"
        type="symbol"
        source="map-order-anchors"
        beforeId="anchor-hover"
        layout={{visibility: 'none'}}
      />
      <Layer
        id="anchor-assignments"
        type="symbol"
        source="map-order-anchors"
        beforeId="anchor-demography"
        layout={{visibility: 'none'}}
      />
      <Layer
        id="anchor-overlays"
        type="symbol"
        source="map-order-anchors"
        beforeId="anchor-assignments"
        layout={{visibility: 'none'}}
      />
      <Layer
        id="anchor-counties"
        type="symbol"
        source="map-order-anchors"
        beforeId="anchor-overlays"
        layout={{visibility: 'none'}}
      />
    </Source>
  );
}
