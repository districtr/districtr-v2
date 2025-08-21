import {MutableRefObject, useEffect, useRef, useState} from 'react';
import {useMapStore} from '../store/mapStore';
import {getPointSelectionData} from '../utils/api/apiHandlers/getPointSelectionData';
import {BLOCK_LAYER_ID, BLOCK_LAYER_ID_CHILD, EMPTY_FT_COLLECTION} from '../constants/layers';
import {useQuery} from '@tanstack/react-query';
import GeometryWorker from '../utils/GeometryWorker';

const updateData = async (
  layer: string,
  child: boolean,
  exposedChildIds: Set<string>,
  data: MutableRefObject<GeoJSON.FeatureCollection<GeoJSON.Point>>
) => {
  if (!layer) {
    data.current = EMPTY_FT_COLLECTION;
    return new Date().toISOString();
  }
  const childWithNoneBroken = child && !exposedChildIds.size;
  // @ts-expect-error
  const parentWithSameLayer = !child && data.current?.metadata?.layer === layer;
  if (childWithNoneBroken) {
    data.current = EMPTY_FT_COLLECTION;
    return new Date().toISOString();
  } else if (parentWithSameLayer) {
    // Do nothing
    return new Date().toISOString();
  }

  data.current = await getPointSelectionData({
    layer,
    columns: ['path', 'x', 'y', 'total_pop_20'],
    filterIds: child ? exposedChildIds : undefined,
    source: child ? BLOCK_LAYER_ID_CHILD : BLOCK_LAYER_ID,
  });
  await GeometryWorker?.setPointData(data.current);
  return new Date().toISOString();
};

export const usePointData = (child?: boolean) => {
  const data = useRef<GeoJSON.FeatureCollection<GeoJSON.Point>>(EMPTY_FT_COLLECTION);
  const mapDocument = useMapStore(state => state.mapDocument);
  const exposedChildIds = useMapStore(state => state.shatterIds.children);
  const layer = child ? mapDocument?.child_layer : mapDocument?.parent_layer;
  const {data: pointData} = useQuery({
    queryKey: [
      'point-data',
      layer,
      child ? JSON.stringify(Array.from(exposedChildIds)) : undefined,
    ],
    queryFn: () => layer && updateData(layer, Boolean(child), exposedChildIds, data),
    refetchOnWindowFocus: false,
  });
  return data;
};
