'use client';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {GEODATA_URL} from '@/app/utils/api/constants';
import {FilterSpecification} from 'maplibre-gl';
import {useMemo} from 'react';
import {Layer, Source} from 'react-map-gl/maplibre';

export const CountyLayers = () => {
  const mapOptions = useMapControlsStore(state => state.mapOptions);

  const countyFilter = useMemo(() => {
    // If currentStateFp is set and not empty, match any of its values
    const stateFpsArray = mapOptions.currentStateFp ? Array.from(mapOptions.currentStateFp) : [];
    return [
      'match',
      ['slice', ['get', 'GEOID'], 0, 2],
      stateFpsArray,
      true,
      false,
    ] as FilterSpecification;
  }, [mapOptions.currentStateFp]);

  return (
    <>
      <Source
        id="counties"
        type="vector"
        url={`pmtiles://${GEODATA_URL}/basemaps/tiger/tiger2023/tl_2023_us_county_full.pmtiles`}
      >
        <Layer
          id="counties_fill"
          beforeId="places_locality"
          type="fill"
          source-layer="tl_2023_us_county"
          paint={{
            'fill-color': '#fff',
            'fill-opacity': 0,
          }}
          filter={countyFilter}
        />
        <Layer
          id="counties_boundary"
          beforeId="places_locality"
          type="line"
          source-layer="tl_2023_us_county"
          paint={{
            'line-color': '#333',
            'line-opacity': 0.8,
            'line-width': [
              'interpolate',
              ['exponential', 1.6],
              ['zoom'],
              6,
              0.625,
              9,
              1.625,
              18,
              2.25,
            ],
          }}
          layout={{
            visibility: mapOptions.showCountyBoundaries ? 'visible' : 'none',
          }}
          filter={countyFilter}
        />
        <Layer
          id="counties_labels"
          beforeId={mapOptions.prominentCountyNames ? undefined : 'counties_boundary'}
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
