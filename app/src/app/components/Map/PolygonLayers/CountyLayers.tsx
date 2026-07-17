'use client';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {GEODATA_URL} from '@/app/utils/api/constants';
import {FilterSpecification} from 'maplibre-gl';
import {useMemo} from 'react';
import {Layer, Source} from 'react-map-gl/maplibre';
import {
  SENTINEL_EMPTY_ARRAY,
  SENTINEL_EMPTY_VALUE,
  HIGHLIGHT_LINE_COLOR,
  HIGHLIGHT_LINE_WIDTH,
} from '@/app/constants/map/layerStyle';
import {
  HIGHLIGHT_FILL_COLOR,
  SELECTED_LINE_STYLE,
} from '@/app/constants/map/overlayLayerStyles';
import {
  CANONICAL_LAYER_IDS,
  COUNTY_SOURCE_ID,
  MAP_LAYER_ANCHOR_IDS,
} from '@/app/constants/map/layerIds';

export const CountyLayers = ({layerBeforeId}: {layerBeforeId: string}) => {
  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const hoveredCountyGeoid = useMapControlsStore(state => state.hoveredCountyGeoid);
  const paintConstraint = useOverlayStore(state => state.paintConstraint);
  const countyMaskId =
    paintConstraint?.overlayId === COUNTY_SOURCE_ID ? paintConstraint.featureId : null;

  const countyFilter = useMemo(() => {
    // If stateFipsSet is set and not empty, match any of its values
    const stateFpsArray =
      mapOptions.stateFipsSet?.size && mapOptions.stateFipsSet.size > 0
        ? Array.from(mapOptions.stateFipsSet)
        : SENTINEL_EMPTY_ARRAY;
    return [
      'match',
      ['slice', ['get', 'GEOID'], 0, 2],
      stateFpsArray,
      true,
      false,
    ] as FilterSpecification;
  }, [mapOptions.stateFipsSet]);

  return (
    <>
      <Source
        id={COUNTY_SOURCE_ID}
        type="vector"
        url={`pmtiles://${GEODATA_URL}/basemaps/tiger/tiger2023/tl_2023_us_county_full.pmtiles`}
        promoteId="GEOID"
      >
        <Layer
          id={CANONICAL_LAYER_IDS.COUNTIES.BOUNDARY}
          beforeId={layerBeforeId}
          type="line"
          source-layer="tl_2023_us_county"
          paint={{
            'line-color': '#444',
            'line-opacity': 0.9,
            'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 6, 1.5, 9, 3, 18, 5],
          }}
          layout={{
            visibility: mapOptions.showCountyBoundaries ? 'visible' : 'none',
          }}
          filter={countyFilter}
        />
        <Layer
          id={CANONICAL_LAYER_IDS.COUNTIES.FILL}
          beforeId={CANONICAL_LAYER_IDS.COUNTIES.BOUNDARY}
          type="fill"
          source-layer="tl_2023_us_county"
          paint={{
            'fill-color': '#fff',
            'fill-opacity': 0,
          }}
          filter={countyFilter}
        />
        <Layer
          id={CANONICAL_LAYER_IDS.COUNTIES.HIGHLIGHT}
          beforeId={MAP_LAYER_ANCHOR_IDS.hover}
          type="line"
          source-layer="tl_2023_us_county"
          paint={{
            'line-color': HIGHLIGHT_LINE_COLOR,
            'line-width': HIGHLIGHT_LINE_WIDTH,
          }}
          filter={
            hoveredCountyGeoid
              ? ['==', ['get', 'GEOID'], hoveredCountyGeoid]
              : ['==', ['get', 'GEOID'], SENTINEL_EMPTY_VALUE]
          }
        />
        {/* Hover highlight while choosing a county paint mask (feature-state hover) */}
        <Layer
          id={CANONICAL_LAYER_IDS.COUNTIES.HOVER_FILL}
          beforeId={MAP_LAYER_ANCHOR_IDS.hover}
          type="fill"
          source-layer="tl_2023_us_county"
          paint={HIGHLIGHT_FILL_COLOR}
          filter={countyFilter}
        />
        {/* Dim everything outside the active county paint mask.
            NOTE: must be direct children of <Source> (no fragment) so
            react-map-gl can inject the source prop. */}
        {countyMaskId && (
          <Layer
            id={CANONICAL_LAYER_IDS.COUNTIES.MASK}
            beforeId={MAP_LAYER_ANCHOR_IDS.hover}
            type="fill"
            source-layer="tl_2023_us_county"
            paint={{
              'fill-color': '#FFFFFF',
              'fill-opacity': 0.75,
            }}
            filter={
              [
                'all',
                countyFilter,
                ['!', ['==', ['get', 'GEOID'], countyMaskId]],
              ] as FilterSpecification
            }
          />
        )}
        {countyMaskId && (
          <Layer
            id={CANONICAL_LAYER_IDS.COUNTIES.SELECTED}
            beforeId={MAP_LAYER_ANCHOR_IDS.hover}
            type="line"
            source-layer="tl_2023_us_county"
            paint={SELECTED_LINE_STYLE}
            filter={['==', ['get', 'GEOID'], countyMaskId]}
          />
        )}
        <Layer
          id={CANONICAL_LAYER_IDS.COUNTIES.LABELS}
          beforeId={mapOptions.prominentCountyNames ? undefined : MAP_LAYER_ANCHOR_IDS.counties}
          type="symbol"
          source-layer="tl_2023_us_county_label"
          minzoom={6}
          layout={{
            'text-field': ['get', 'NAME'],
            'text-font': mapOptions.prominentCountyNames ? ['Barlow Bold'] : ['Barlow Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 5, 8, 8, 12, 12, 16],
            'text-transform': 'uppercase',
            'text-letter-spacing': 0.1,
            'text-max-width': 12,
            'text-padding': ['interpolate', ['linear'], ['zoom'], 5, 3, 8, 7, 12, 11],
          }}
          paint={{
            'text-color': '#666',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          }}
          filter={countyFilter}
        />
      </Source>
    </>
  );
};
