import {MutableRefObject, useEffect, useRef, useState} from 'react';
import {useMapStore} from '../store/mapStore';
import {useAssignmentsStore} from '../store/assignmentsStore';
import {getPointSelectionData} from '../utils/api/apiHandlers/getPointSelectionData';
import {EMPTY_FT_COLLECTION} from '../constants/map/layerStyle';
import {BLOCK_SOURCE_ID} from '../constants/map/layerIds';
import {useQuery} from '@tanstack/react-query';
import GeometryWorker from '../utils/GeometryWorker';

const EMPTY_POINT_COLLECTION = EMPTY_FT_COLLECTION as GeoJSON.FeatureCollection<GeoJSON.Point>;

const updateData = async (
  layer: string,
  isChild: boolean,
  exposedChildIds: Set<string>,
  data: MutableRefObject<GeoJSON.FeatureCollection<GeoJSON.Point>>
) => {
  if (!layer) {
    data.current = EMPTY_POINT_COLLECTION;
    return new Date().toISOString();
  }
  const childWithNoneBroken = isChild && !exposedChildIds.size;
  // @ts-expect-error
  const parentWithSameLayer = !isChild && data.current?.metadata?.layer === layer;
  if (childWithNoneBroken) {
    data.current = EMPTY_POINT_COLLECTION;
    return new Date().toISOString();
  } else if (parentWithSameLayer) {
    // Do nothing
    return new Date().toISOString();
  }

  const result = await getPointSelectionData({
    layer,
    columns: ['path', 'x', 'y', 'total_pop_20'],
    filterIds: isChild ? exposedChildIds : undefined,
    source: BLOCK_SOURCE_ID,
  });
  data.current = result;

  // Send point data to GeometryWorker if this is the parent layer (not child)
  if (!isChild && GeometryWorker) {
    GeometryWorker.setPointData(data.current);
  }

  return new Date().toISOString();
};

export const usePointData = (isChild?: boolean) => {
  const data = useRef<GeoJSON.FeatureCollection<GeoJSON.Point>>(EMPTY_POINT_COLLECTION);
  const [dataHash, setDataHash] = useState<string>('');
  const mapDocument = useMapStore(state => state.mapDocument);
  const exposedChildIds = useAssignmentsStore(state => state.shatterIds.children);
  const layer = isChild ? mapDocument?.child_layer : mapDocument?.parent_layer;
  useEffect(() => {
    if (layer) {
      updateData(layer, Boolean(isChild), exposedChildIds, data).then(hash => {
        setDataHash(hash);
      });
    }
  }, [layer, isChild, isChild ? JSON.stringify(Array.from(exposedChildIds)) : undefined]);
  return data;
};
