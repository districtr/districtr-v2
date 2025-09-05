import {
  EMPTY_FT_COLLECTION,
  LABELS_BREAK_LAYER_ID,
  ZONE_ASSIGNMENT_STYLE,
} from '@/app/constants/layers';
import {useMapStore} from '@/app/store/mapStore';
import {get} from '@/app/utils/api/factory';
import { demographyCache } from '@/app/utils/demography/demographyCache';
import GeometryWorker from '@/app/utils/GeometryWorker';
import {useQuery} from '@tanstack/react-query';
import {useEffect, useRef} from 'react';
import {Layer, Source} from 'react-map-gl/dist/esm/exports-maplibre';

type PublicDistrictData = {
  zone: number;
  demographic_data: Record<string, any>;
  geometry: string; //  GeoJSON.Geometry;
};

export const PublicDistrictLayer = () => {
  const data = useRef<GeoJSON.FeatureCollection<GeoJSON.Geometry>>(EMPTY_FT_COLLECTION);
  const dataHash = useRef<string>('');
  const mapDocument = useMapStore(state => state.mapDocument);
  const colorScheme = useMapStore(state => state.colorScheme);

  const fetchData = async () => {
    const response = await get<Array<PublicDistrictData>>(
      `document/${mapDocument?.public_id}/stats`
    )({});
    if (response.ok) {
      const geojsonFeatures = response.response.map((row: any) => {
        return {
          type: 'Feature',
          geometry: JSON.parse(row.geometry) as GeoJSON.Geometry,
          properties: {
            ...row.demographic_data,
            zone: row.zone,
          },
        } as GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>;
      });
      data.current = {
        type: 'FeatureCollection',
        features: geojsonFeatures,
      };
      // @ts-ignore
      GeometryWorker?.loadGeometry(geojsonFeatures, 'zone');
      // @ts-ignore
      GeometryWorker?.updateZones(geojsonFeatures.map((f, i) => [f.properties.zone, f.properties.zone-1]));

      // DEMOGRAPHY
      // const demographyResult = {}
    // demographyCache.update(result.columns, result.results, dataHash.current);
    // const availableColumns = demographyCache?.table?.columnNames() ?? [];
    // const availableEvalSets: Record<string, AllEvaluationConfigs> = Object.fromEntries(
    //   Object.entries(evalColumnConfigs)
    //     .map(([columnsetKey, config]) => [
    //       columnsetKey,
    //       config.filter(entry => availableColumns.includes(entry.column)),
    //     ])
    //     .filter(([, config]) => config.length > 0)
    // );
    // const availableMapSets: Record<string, AllMapConfigs> = Object.fromEntries(
    //   Object.entries(choroplethMapVariables)
    //     .map(([columnsetKey, config]) => [
    //       columnsetKey,
    //       config.filter(entry => availableColumns.includes(entry.value)),
    //     ])
    //     .filter(([, config]) => config.length > 0)
    // );
    // setDataHash(dataHash);
    // setAvailableColumnSets({
    //   evaluation: availableEvalSets,
    //   map: availableMapSets,
    // });
    }
  };

  const {} = useQuery({
    queryKey: ['public-districts', mapDocument?.public_id],
    queryFn: fetchData,
    enabled: Boolean(mapDocument?.public_id),
  });

  const lineWidth = 2;

  return (
    <Source id="public-districts" type="geojson" data={data.current}>
      <Layer
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
      />
      <Layer
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
      />
    </Source>
  );
};
