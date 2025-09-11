import {
  EMPTY_FT_COLLECTION,
  LABELS_BREAK_LAYER_ID,
  ZONE_ASSIGNMENT_STYLE,
} from '@/app/constants/layers';
import {NullableZone} from '@/app/constants/types';
import {useMapStore} from '@/app/store/mapStore';
import {get} from '@/app/utils/api/factory';
import {AllTabularColumns} from '@/app/utils/api/summaryStats';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import GeometryWorker from '@/app/utils/GeometryWorker';
import {ColumnarTableData} from '@/app/utils/ParquetWorker/parquetWorker.types';
import {useQuery} from '@tanstack/react-query';
import {useEffect, useRef} from 'react';
import {Layer, Source} from 'react-map-gl/dist/esm/exports-maplibre';
import {BLOCK_SOURCE_ID} from '@/app/constants/layers';
import { DemographicLayer } from './DemographicLayer';

import { useChoroplethRenderer } from '@/app/hooks/useChoroplethRenderer';

type PublicDistrictData = {
  zone: number;
  demographic_data: Record<string, any>;
  geometry: string; //  GeoJSON.Geometry;
};

export const PublicDistrictLayer = ({isDemographicMap}: {isDemographicMap?: boolean}) => {
  const data = useRef<GeoJSON.FeatureCollection<GeoJSON.Geometry>>(EMPTY_FT_COLLECTION);
  const mapDocument = useMapStore(state => state.mapDocument);
  const colorScheme = useMapStore(state => state.colorScheme);
  useChoroplethRenderer();

  const fetchData = async () => {
    const response = await get<Array<PublicDistrictData>>(
      `document/${mapDocument?.public_id}/stats`
    )({});
    if (response.ok) {
      const geojsonFeatures: GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>[] = [];
      const columns: Set<AllTabularColumns[number]> = new Set();
      const demographicData: ColumnarTableData = {
        path: [],
        sourceLayer: [],
      };
      const assignments: Map<string, NullableZone> = new Map();

      response.response.forEach((row: any, i) => {
        const feature = {
          type: 'Feature',
          geometry: JSON.parse(row.geometry) as GeoJSON.Geometry,
          properties: {
            ...row.demographic_data,
            zone: row.zone,
            path: row.zone,
          },
        } as GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>;
        geojsonFeatures.push(feature);
        Object.keys(row.demographic_data).forEach(column =>
          columns.add(column as AllTabularColumns[number])
        );
        demographicData.path.push(row.zone);
        demographicData.sourceLayer.push(mapDocument?.parent_layer ?? '');
        Object.entries(row.demographic_data).forEach(([column, value]) => {
          if (!columns.has(column as AllTabularColumns[number]))
            columns.add(column as AllTabularColumns[number]);
          if (!(column in demographicData))
            demographicData[column as AllTabularColumns[number]] = [];
          demographicData[column as AllTabularColumns[number]]!.push(value as number);
          assignments.set(row.zone, row.zone);
        });
      });

      data.current = {
        type: 'FeatureCollection',
        features: geojsonFeatures,
      };
      if (columns.size) {
        demographyCache.update({columns: Array.from(columns), results: demographicData});
        demographyCache.updateZoneTable(assignments);
        demographyCache.updatePopulations(assignments);
      }
      // @ts-ignore
      GeometryWorker?.loadGeometry(geojsonFeatures, 'zone');
      // @ts-ignore
      GeometryWorker?.updateZones(
        geojsonFeatures.map((f, i) => [f.properties?.zone, f.properties?.zone - 1])
      );
      return true;
    } else {
      return false;
    }
  };

  const {} = useQuery({
    queryKey: ['public-districts', mapDocument?.public_id],
    queryFn: fetchData,
    enabled: Boolean(mapDocument?.public_id),
  });

  const lineWidth = 2;

  return (
    <Source id={BLOCK_SOURCE_ID} type="geojson" data={data.current} promoteId="zone">
      {!isDemographicMap && <Layer
        id={'public-districts-layer-line'}
        beforeId={LABELS_BREAK_LAYER_ID}
        type="line"
        layout={{
          visibility: 'visible',
        }}
        paint={{
          'line-opacity': 0.8,
          // 'line-color': '#aaaaaa', // Default color
          'line-color': [
            'interpolate',
            ['exponential', 1.6],
            ['zoom'],
            6,
            '#aaa',
            9,
            '#777',
            14,
            '#333',
          ],
          'line-width': [
            'interpolate',
            ['exponential', 1.6],
            ['zoom'],
            6,
            lineWidth * 0.125,
            9,
            lineWidth * 0.35,
            14,
            lineWidth,
          ],
        }}
      />}
      {!isDemographicMap && <Layer
        id="public-districts-layer"
        type="fill"
        source="public-districts"
        beforeId={LABELS_BREAK_LAYER_ID}
        paint={{
          'fill-opacity': 0.7,
          'fill-color':
            ZONE_ASSIGNMENT_STYLE(colorScheme, (i: number) => ['==', ['get', 'zone'], i + 1]) ||
            '#000000',
        }}
      />}
      {isDemographicMap && <DemographicLayer />}
    </Source>
  );
};
