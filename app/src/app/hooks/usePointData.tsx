import {MutableRefObject, useEffect, useRef, useState} from 'react';
import {useMapStore} from '../store/mapStore';
import {useAssignmentsStore} from '../store/assignmentsStore';
import {getPointSelectionData} from '../utils/api/apiHandlers/getPointSelectionData';
import {BLOCK_LAYER_ID, BLOCK_LAYER_ID_CHILD, EMPTY_FT_COLLECTION} from '../constants/layers';
import {useQuery} from '@tanstack/react-query';
import GeometryWorker from '../utils/GeometryWorker';

const updateData = async (
  layer: string,
  isChild: boolean,
  exposedChildIds: Set<string>,
  data: MutableRefObject<GeoJSON.FeatureCollection<GeoJSON.Point>>
) => {
  if (!layer) {
    console.log('No layer provided');
    data.current = EMPTY_FT_COLLECTION;
    return new Date().toISOString();
  }
  const childWithNoneBroken = isChild && !exposedChildIds.size;
  // @ts-expect-error
  const parentWithSameLayer = !isChild && data.current?.metadata?.layer === layer;
  if (childWithNoneBroken) {
    console.log('childWithNoneBroken is true');
    data.current = EMPTY_FT_COLLECTION;
    return new Date().toISOString();
  } else if (parentWithSameLayer) {
    console.log('parentWithSameLayer is true');
    // Do nothing
    return new Date().toISOString();
  }

  const result = await getPointSelectionData({
    layer,
    columns: ['path', 'x', 'y', 'total_pop_20'],
    filterIds: isChild ? exposedChildIds : undefined,
    source: isChild ? BLOCK_LAYER_ID_CHILD : BLOCK_LAYER_ID,
  });
  console.log('result', result.features.length);
  data.current = result;
  console.log('data', isChild ? 'CHILD' : 'PARENT', data.current.features.length);

  // Send point data to GeometryWorker if this is the parent layer (not child)
  if (!isChild && GeometryWorker) {
    GeometryWorker.setPointData(data.current);
  }

  return new Date().toISOString();
};

export const usePointData = (isChild?: boolean) => {
  const data = useRef<GeoJSON.FeatureCollection<GeoJSON.Point>>(EMPTY_FT_COLLECTION);
  const [dataHash, setDataHash] = useState<string>('');
  const mapDocument = useMapStore(state => state.mapDocument);
  const exposedChildIds = useAssignmentsStore(state => state.shatterIds.children);
  const layer = isChild ? mapDocument?.child_layer : mapDocument?.parent_layer;
  useEffect(() => {
    console.log('layer', layer);
    console.log('isChild', isChild);
    console.log('exposedChildIds', exposedChildIds);
    if (layer) {
      updateData(layer, Boolean(isChild), exposedChildIds, data).then((hash) => {
        setDataHash(hash);
      });
    }
  }, [
    layer,
    isChild,
    isChild ? JSON.stringify(Array.from(exposedChildIds)) : undefined,
  ]);
  return data;
};
