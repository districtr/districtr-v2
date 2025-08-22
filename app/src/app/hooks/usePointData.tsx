import {MutableRefObject, useEffect, useRef, useState} from 'react';
import {useMapStore} from '../store/mapStore';
import {getPointSelectionData} from '../utils/api/apiHandlers/getPointSelectionData';
import {BLOCK_LAYER_ID, BLOCK_LAYER_ID_CHILD, EMPTY_FT_COLLECTION} from '../constants/layers';
import {useQuery} from '@tanstack/react-query';
import { queryClient } from '../utils/api/queryClient';
import { DocumentObject } from '../utils/api/apiHandlers/types';

const updateData = async (
  layer: string,
  child: boolean,
  mapDocument: DocumentObject | null,
  exposedChildIds: Set<string>,
  data: MutableRefObject<GeoJSON.FeatureCollection<GeoJSON.Point>>
) => {
  const mapDocumentQueryStatus = queryClient.getQueryState([
    'mapDocument',
    mapDocument?.document_id,
  ]);
  // @ts-expect-error - queryClient.getQueryState is not typed correctly
  const mapDocumentIsFetching = mapDocumentQueryStatus?.status !== 'idle';
  if (!layer || !mapDocument || mapDocumentIsFetching) {
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

  const pointData = await getPointSelectionData({
    layer,
    columns: ['path', 'x', 'y', 'total_pop_20'],
    filterIds: child ? exposedChildIds : undefined,
    source: child ? BLOCK_LAYER_ID_CHILD : BLOCK_LAYER_ID,
  });
  if (pointData) {
    data.current = pointData;
  }
  return new Date().toISOString();
};

export const usePointData = (child?: boolean) => {
  const data = useRef<GeoJSON.FeatureCollection<GeoJSON.Point>>(EMPTY_FT_COLLECTION);
  const mapDocument = useMapStore(state => state.mapDocument);
  const exposedChildIds = useMapStore(state => state.shatterIds.children);
  const layer = child ? mapDocument?.child_layer : mapDocument?.parent_layer;
  useQuery({
    queryKey: [
      'point-data',
      layer,
      child ? JSON.stringify(Array.from(exposedChildIds)) : undefined,
    ],
    queryFn: () => layer && updateData(layer, Boolean(child), mapDocument, exposedChildIds, data),
    refetchOnWindowFocus: false,
  });
  return data;
};
