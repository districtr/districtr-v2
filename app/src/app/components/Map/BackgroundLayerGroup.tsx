import {
  BLOCK_LAYER_ID_SHATTER,
  BLOCK_SOURCE_ID,
  LABELS_BREAK_LAYER_ID,
} from '@/app/constants/layers';
import { useLayerFilter } from '@/app/hooks/useLayerFilter';
import { useMapStore } from '@/app/store/mapStore';
import { useMapControlsStore } from '@/app/store/mapControlsStore';
import { Layer } from 'react-map-gl/maplibre';

export const BackgroundLayerGroup = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const showPaintedDistricts = useMapControlsStore(state => state.mapOptions.showPaintedDistricts);
  const parentLayerId = mapDocument?.parent_layer;
  const childLayerId = mapDocument?.child_layer;

  if (!parentLayerId || !mapDocument) return null;

  const parentLayerFilter = useLayerFilter(false);
  const childLayerFilter = useLayerFilter(true);
  const shatterBackgroundOpacity = [
    'case',
    [
      'all',
      ['==', ['feature-state', 'zone'], null],
      ['==', ['feature-state', 'community_mix'], null],
      ['==', ['feature-state', 'community_draw'], null],
      ['!', ['boolean', ['feature-state', 'selected'], false]],
    ],
    // Fully unassigned => show shatter background.
    0.2,
    // Any zone/community assignment (or selected paint state) => transparent background.
    0,
  ] as const;

  return (
    <>
      {/* Base background for untouched parent geographies */}
      <Layer
        id={`${BLOCK_LAYER_ID_SHATTER}-background`}
        source={BLOCK_SOURCE_ID}
        source-layer={parentLayerId}
        filter={parentLayerFilter}
        beforeId={LABELS_BREAK_LAYER_ID}
        type="fill"
        layout={{ visibility: showPaintedDistricts ? 'visible' : 'none' }}
        paint={{
          'fill-opacity': shatterBackgroundOpacity,
          'fill-color': '#cecece',
        }}
      />
      {/* Broken geographies use the same neutral background tone on child tiles */}
      {childLayerId && (
        <Layer
          id={`${BLOCK_LAYER_ID_SHATTER}-background-child`}
          source={BLOCK_SOURCE_ID}
          source-layer={childLayerId}
          filter={childLayerFilter}
          beforeId={LABELS_BREAK_LAYER_ID}
          type="fill"
          layout={{ visibility: showPaintedDistricts ? 'visible' : 'none' }}
          paint={{
            'fill-opacity': shatterBackgroundOpacity,
            'fill-color': '#cecece',
          }}
        />
      )}
    </>
  );
};
