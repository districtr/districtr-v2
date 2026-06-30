import type React from 'react';
import {Layer, Source} from 'react-map-gl/maplibre';
import {EMPTY_FT_COLLECTION} from '@/app/constants/map/layerStyle';
import {MAP_LAYER_ANCHOR_ORDER} from '@/app/constants/map/layerRenderConfig';
import {LABELS_BREAK_LAYER_ID, MAP_ORDER_ANCHORS_SOURCE_ID} from '@/app/constants/map/layerIds';

/**
 *
 * Invisible anchor layers used only for deterministic map draw ordering.
 *
 * These layers render nothing (empty GeoJSON source + `visibility: 'none'`),
 * but expose stable layer IDs that other components target via `beforeId`.
 * This prevents z-order from depending on React mount timing.
 * Keep this mounted before layer groups that reference `anchor-*` IDs.
 * Canonical top -> bottom ordering is defined in `MAP_LAYER_ANCHOR_ORDER`:
 * `hover -> reference -> overlays -> demography -> assignments -> geometryOutline -> counties`.
 *
 *
 * NOTE: The geometry data is set to an empty GeoJSON collection, and the visibility of the
 * layers is set to 'none' to ensure low overhead.
 */
export const MapLayerAnchors: React.FC = () => {
  return (
    <Source id={MAP_ORDER_ANCHORS_SOURCE_ID} type="geojson" data={EMPTY_FT_COLLECTION}>
      {MAP_LAYER_ANCHOR_ORDER.map((id, i) => (
        <Layer
          key={id}
          id={id}
          type="symbol"
          source={MAP_ORDER_ANCHORS_SOURCE_ID}
          beforeId={i === 0 ? LABELS_BREAK_LAYER_ID : MAP_LAYER_ANCHOR_ORDER[i - 1]}
          layout={{visibility: 'none'}}
        />
      ))}
    </Source>
  );
};
