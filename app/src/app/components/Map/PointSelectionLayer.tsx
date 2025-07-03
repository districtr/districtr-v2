import {BLOCK_LAYER_ID, BLOCK_LAYER_ID_CHILD, BLOCK_POINTS_LAYER_ID, BLOCK_POINTS_LAYER_ID_CHILD, EMPTY_FT_COLLECTION} from '@/app/constants/layers';
import {useLayerFilter} from '@/app/hooks/useLayerFilter';
import {useMapStore} from '@/app/store/mapStore';
import { asyncBufferFromUrl, parquetReadObjects } from 'hyparquet';
import React, {useEffect, useRef, useState} from 'react';
import {Layer, Source} from 'react-map-gl/dist/esm/exports-maplibre';

const generateGeojson = (pointData: any[], mapDocument: any, child: boolean) => {
  const source = child ? BLOCK_LAYER_ID_CHILD : BLOCK_LAYER_ID;
  const sourceLayer = child ? mapDocument?.child_layer : mapDocument?.parent_layer;
  return {
    type: 'FeatureCollection',
    features: pointData.map((d: any) => ({
      type: 'Feature',
      geometry: {type: 'Point', coordinates: [d.x, d.y]},
      properties: {
        path: d.path,
        total_pop_20: parseInt(d.total_pop_20),
        __source: source,
        __sourceLayer: sourceLayer,
      },
    })),
  } as GeoJSON.FeatureCollection<GeoJSON.Point>;
};

export const PointSelectionLayer: React.FC<{child?: boolean}> = ({child = false}) => {
  const fullData = useRef<any[] | null>(null);
  const data = useRef<GeoJSON.FeatureCollection<GeoJSON.Point> | null>(null);
  const mapDocument = useMapStore(state => state.mapDocument);
  const brokenChildIds = useMapStore(state => state.shatterIds.children);
  const layerFilter = useLayerFilter(child);
  const sourceID = 'SELECTION_POINTS' + (child ? '_child' : '');
  const [dataHash, setDataHash] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
    const layer = child ? mapDocument?.child_layer : mapDocument?.parent_layer;
    if (layer) {
      const url = `${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/dev/${layer}_points.parquet`;
      const file = await asyncBufferFromUrl({ url }) // wrap url for async fetching
      const parquetData = await parquetReadObjects({
        file,
        columns: ['path', 'x', 'y', 'total_pop_20'],
      }) as any;
      if (child) {
        fullData.current = parquetData;
        setDataHash(new Date().toISOString());
      } else {
        data.current = generateGeojson(parquetData, mapDocument, child);
        setDataHash(new Date().toISOString());
      }
    }
    };
    fetchData();
  }, [child ? mapDocument?.child_layer : mapDocument?.parent_layer]);

  useEffect(() => {
    if (child && brokenChildIds.size > 0 && data.current?.features?.length !== brokenChildIds.size) {
      const newData = fullData.current?.filter((d: any) => brokenChildIds.has(d.path));
      if (newData) {
        data.current = generateGeojson(newData, mapDocument, child);
        setDataHash(new Date().toISOString());
      }
    }
  }, [child, brokenChildIds, dataHash]);

  return (
    <Source id={sourceID} type="geojson" promoteId="path" data={data.current || EMPTY_FT_COLLECTION}>
      <Layer
        id={child ? BLOCK_POINTS_LAYER_ID_CHILD : BLOCK_POINTS_LAYER_ID}
        source={sourceID}
        filter={layerFilter}
        type="circle"
        paint={{
          'circle-radius': 1,
          'circle-color': '#000000',
        }}
      />
    </Source>
  );
};
