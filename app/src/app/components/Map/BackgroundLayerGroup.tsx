import {
  BLOCK_LAYER_ID_SHATTER,
  BLOCK_SOURCE_ID,
  LABELS_BREAK_LAYER_ID,
} from '@/app/constants/layers';
import { useLayerFilter } from '@/app/hooks/useLayerFilter';
import { useMapControlsStore } from '@/app/store/mapControlsStore';
import { useMapStore } from '@/app/store/mapStore';
import { Layer } from 'react-map-gl/maplibre';
import type { DataDrivenPropertyValueSpecification } from 'maplibre-gl';

export const BackgroundLayerGroup = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const showCommunities = useMapControlsStore(state => state.mapOptions.showCommunities);
  const showPaintedDistricts = useMapControlsStore(state => state.mapOptions.showPaintedDistricts);
  const parentLayerId = mapDocument?.parent_layer;
  const childLayerId = mapDocument?.child_layer;

  if (!parentLayerId || !mapDocument) return null;

  const parentLayerFilter = useLayerFilter(false);
  const childLayerFilter = useLayerFilter(true);
  const zoneClear = showPaintedDistricts
    ? (['==', ['feature-state', 'zone'], null] as any)
    : (['literal', true] as any);
  const communityClear = showCommunities
    ? ([
        'all',
        ['==', ['feature-state', 'community_mix'], null],
        ['==', ['feature-state', 'community_draw'], null],
      ] as any)
    : (['literal', true] as any);
  const selectedClear = showPaintedDistricts
    ? (['!', ['boolean', ['feature-state', 'selected'], false]] as any)
    : (['literal', true] as any);
  const isTransparentByAssignment = [
    'all',
    zoneClear,
    communityClear,
    selectedClear,
  ];
  const shatterBackgroundOpacity = [
    'case',
    isTransparentByAssignment,
    // Unassigned in currently visible assignment layers => show background.
    0.2,
    // Any visible assignment (or selected paint state) => transparent background.
    0,
  ] as unknown as DataDrivenPropertyValueSpecification<number>;

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
        layout={{ visibility: 'visible' }}
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
          layout={{ visibility: 'visible' }}
          paint={{
            'fill-opacity': shatterBackgroundOpacity,
            'fill-color': '#cecece',
          }}
        />
      )}
    </>
  );
};
