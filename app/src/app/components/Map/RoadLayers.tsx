'use client';
import {useMapStore} from '@/app/store/mapStore';
import {FilterSpecification} from 'maplibre-gl';
import {Layer, Source} from 'react-map-gl/maplibre';

export const RoadLayers = () => {
  const mapOptions = useMapStore(state => state.mapOptions);

  return (
    <>
      <Source
        id="road_detail"
        type="vector"
        url={`pmtiles://${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/basemaps/20240325.pmtiles`}
      >
        <Layer
          id="roads_major_labels"
          beforeId={undefined}
          type="symbol"
          source-layer="roads"
          minzoom={11}
          layout={{
            'text-field': ['get', 'name'],
            'text-font': mapOptions.prominentStreetNames ? ['Barlow Bold'] : ['Barlow Regular'],
            'text-size': 14,
            'text-letter-spacing': 0.1,
            'symbol-placement': 'line',
            visibility: 'visible',
          }}
          paint={{
            'text-color': mapOptions.prominentStreetNames ? '#8d8d8d' : '#999999',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          }}
          filter={['any', ['in', 'pmap:kind', 'highway', 'major_road', 'medium_road']]}
        />

        <Layer
          id="roads_minor_labels"
          beforeId={undefined}
          type="symbol"
          source-layer="roads"
          minzoom={14}
          layout={{
            'text-field': ['get', 'name'],
            'text-font': mapOptions.prominentStreetNames ? ['Barlow Bold'] : ['Barlow Regular'],
            'text-size': 12,
            'text-letter-spacing': 0.1,
            'symbol-placement': 'line',
            visibility: 'visible',
          }}
          paint={{
            'text-color': mapOptions.prominentStreetNames ? '#8d8d8d' : '#999999',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          }}
          filter={[
            'all',
            ['==', 'pmap:level', 0],
            ['==', 'pmap:kind', 'minor_road'],
            ['!=', 'pmap:kind_detail', 'service'],
          ]}
        />

        <Layer
          id="roads_major"
          beforeId="places_locality"
          type="line"
          source-layer="roads"
          paint={{
            'line-color': mapOptions.prominentStreetNames ? '#c5c5c5' : '#ebebeb',
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
            visibility: 'visible',
          }}
          filter={['all', ['==', 'pmap:level', 0], ['==', 'pmap:kind', 'major_road']]}
        />
        <Layer
          id="roads_medium"
          beforeId="places_locality"
          type="line"
          source-layer="roads"
          paint={{
            'line-color': mapOptions.prominentStreetNames ? '#c5c5c5' : '#ebebeb',
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
            visibility: 'visible',
          }}
          filter={['all', ['==', 'pmap:level', 0], ['==', 'pmap:kind', 'medium_road']]}
        />
        <Layer
          id="roads_minor"
          beforeId="places_locality"
          type="line"
          source-layer="roads"
          paint={{
            'line-color': mapOptions.prominentStreetNames ? '#c5c5c5' : '#ebebeb',
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
            visibility: 'visible',
          }}
          filter={[
            'all',
            ['==', 'pmap:level', 0],
            ['==', 'pmap:kind', 'minor_road'],
            ['!=', 'pmap:kind_detail', 'service'],
          ]}
        />
      </Source>
    </>
  );
};
