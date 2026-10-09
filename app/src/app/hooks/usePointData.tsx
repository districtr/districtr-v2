import {MutableRefObject, useEffect, useRef, useState} from 'react';
import {useMapStore} from '../store/mapStore';
import {useAssignmentsStore} from '../store/assignmentsStore';
import {useCoiAssignmentsStore} from '../store/coiAssignmentsStore';
import {useMapControlsStore} from '../store/mapControlsStore';
import {MAP_MODES} from '@constants/map/mode';
import {getPointSelectionData} from '../utils/api/apiHandlers/getPointSelectionData';
import {EMPTY_FT_COLLECTION} from '../constants/map/layerStyle';
import {BLOCK_SOURCE_ID} from '../constants/map/layerIds';
import {useQuery} from '@tanstack/react-query';
import GeometryWorker from '../utils/GeometryWorker';
import {DocumentObject} from '../utils/api/apiHandlers/types';
import {TOPOLOGY_VARIANT} from '../utils/topology/flag';
import {ensureBase, ensureLabels} from '../utils/topology/state';
import ParquetWorker from '../utils/ParquetWorker';

/** Latest updateData call per [parent, child]; only the topology path drops stale ones. */
const requestIds = [0, 0];

/**
 * Topology prototype: label points as the points parquet's GeoJSON (parents, or the exposed
 * children), from parents.parquet and children.parquet only. Null means no topology.
 */
const getTopologyPoints = async (
  mapDocument: DocumentObject | null,
  layer: string,
  isChild: boolean,
  exposedChildIds: Set<string>
) => {
  if (!isChild) {
    const base = await ensureBase(mapDocument);
    return base && ParquetWorker
      ? ParquetWorker.getTopologyPoints(base, layer, BLOCK_SOURCE_ID)
      : null;
  }
  const parentIds = Array.from(
    useMapControlsStore.getState().mapMode === MAP_MODES.COI
      ? useCoiAssignmentsStore.getState().shatterIds.parents
      : useAssignmentsStore.getState().shatterIds.parents
  );
  const base = await ensureLabels(mapDocument, parentIds);
  if (!base || !ParquetWorker) return null;
  const points = await ParquetWorker.getTopologyPoints(base, layer, BLOCK_SOURCE_ID, parentIds);
  points.features = points.features.filter(f => exposedChildIds.has(f.properties!.path));
  return points;
};

const updateData = async (
  layer: string,
  isChild: boolean,
  exposedChildIds: Set<string>,
  data: MutableRefObject<GeoJSON.FeatureCollection<GeoJSON.Point>>,
  mapDocument: DocumentObject | null
) => {
  const requestId = ++requestIds[Number(isChild)];
  if (!layer) {
    data.current = EMPTY_FT_COLLECTION;
    return new Date().toISOString();
  }
  const childWithNoneBroken = isChild && !exposedChildIds.size;
  // @ts-expect-error
  const parentWithSameLayer = !isChild && data.current?.metadata?.layer === layer;
  if (childWithNoneBroken) {
    data.current = EMPTY_FT_COLLECTION;
    if (GeometryWorker) GeometryWorker.setChildPointData(EMPTY_FT_COLLECTION);
    return new Date().toISOString();
  } else if (parentWithSameLayer) {
    // Do nothing
    return new Date().toISOString();
  }

  if (TOPOLOGY_VARIANT) {
    const points = await getTopologyPoints(mapDocument, layer, isChild, exposedChildIds);
    if (points) {
      if (requestId !== requestIds[Number(isChild)]) return new Date().toISOString();
      // Selection reads the topology, so the MapLibre point layers stay empty.
      data.current = EMPTY_FT_COLLECTION;
      if (GeometryWorker) {
        if (isChild) GeometryWorker.setChildPointData(points);
        else GeometryWorker.setPointData(points);
      }
      performance.mark('districtr:points-ready', {
        detail: {child: isChild, n: points.features.length},
      });
      return new Date().toISOString();
    }
  }

  const result = await getPointSelectionData({
    layer,
    columns: ['path', 'x', 'y', 'total_pop_20'],
    filterIds: isChild ? exposedChildIds : undefined,
    source: BLOCK_SOURCE_ID,
  });
  data.current = result;
  performance.mark('districtr:points-ready', {detail: {child: isChild, n: result.features.length}});

  if (GeometryWorker) {
    if (isChild) {
      GeometryWorker.setChildPointData(data.current);
    } else {
      GeometryWorker.setPointData(data.current);
    }
  }

  return new Date().toISOString();
};

export const usePointData = (isChild?: boolean) => {
  const data = useRef<GeoJSON.FeatureCollection<GeoJSON.Point>>(EMPTY_FT_COLLECTION);
  const [dataHash, setDataHash] = useState<string>('');
  const mapDocument = useMapStore(state => state.mapDocument);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const districtChildIds = useAssignmentsStore(state => state.shatterIds.children);
  const coiChildIds = useCoiAssignmentsStore(state => state.shatterIds.children);
  // COI maps track shattering in their own store; mirror useLayerFilter
  const exposedChildIds = mapMode === MAP_MODES.COI ? coiChildIds : districtChildIds;
  const layer = isChild ? mapDocument?.child_layer : mapDocument?.parent_layer;
  useEffect(() => {
    if (layer) {
      updateData(layer, Boolean(isChild), exposedChildIds, data, mapDocument).then(hash => {
        setDataHash(hash);
      });
    }
  }, [layer, isChild, isChild ? JSON.stringify(Array.from(exposedChildIds)) : undefined]);
  return data;
};
