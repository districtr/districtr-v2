import type {MapGeoJSONFeature, Map as MaplibreMap} from 'maplibre-gl';
import {BLOCK_SOURCE_ID} from '@/app/constants/map/layerIds';
import {overlayIdOf} from '@constants/map/paintBy';
import {getDemography} from '@utils/api/apiHandlers/getDemography';
import {getPointSelectionData} from '@utils/api/apiHandlers/getPointSelectionData';
import type {ColumnarTableData} from '@utils/ParquetWorker/parquetWorker.types';
import {demographyService} from '@utils/demography/demographyService';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useTooltipStore} from '@/app/store/tooltipStore';
import {MIN_AREA_PAINT_ZOOM, inArea, sortAreaUnits} from './paintOverlayArea';

/** The rows of `data` whose path passes `keep`. */
export const pickRows = (data: ColumnarTableData, keep: (path: string) => boolean) => {
  const rows = data.path.flatMap((path, i) => (keep(path) ? [i] : []));
  return Object.fromEntries(
    Object.entries(data).map(([column, values]) => [column, rows.map(i => values![i])])
  ) as ColumnarTableData;
};

/**
 * Inspect by overlay area: the sums for one area, read only (nothing breaks).
 * Approximate (hover): units inside it, plus units on its edge whose center is
 * inside. Exact (click): units on its edge count only their blocks whose
 * center is inside; an unbroken unit's blocks are read from the demography
 * parquet on the side. The reading lands in tooltipStore.areaReading, keyed so
 * a late result for an area the cursor has left is dropped.
 */
export const inspectOverlayArea = async (
  map: MaplibreMap,
  area: MapGeoJSONFeature,
  exact: boolean
) => {
  const overlayId = overlayIdOf(useMapControlsStore.getState().mapOptions.paintBy);
  const {mapDocument, setNotification} = useMapStore.getState();
  if (!overlayId || !mapDocument || area.id == null) return;
  // A break or heal reloads the table (new hash), which makes a reading stale.
  const key = `${overlayId}:${String(area.id)}:${demographyService.hash}`;
  const {areaReading, setAreaReading} = useTooltipStore.getState();
  // Already read (or reading) at least this precisely.
  if (areaReading?.key === key && (areaReading.exact || !exact)) return;
  if (exact && map.getZoom() < MIN_AREA_PAINT_ZOOM) {
    setNotification({
      importance: 2,
      message: 'Zoom in a little for exact numbers: at this zoom the outline is too rough.',
      id: 'inspect-area-zoom',
    });
    return;
  }
  // The approximate numbers stay up while the exact ones load.
  const shown = areaReading?.key === key ? areaReading : null;
  setAreaReading({key, exact, ids: shown?.ids ?? [], extraRows: shown?.extraRows, loading: true});
  try {
    const sorted = await sortAreaUnits(map, overlayId, String(area.id));
    const {shatterIds, parentToChild} = useAssignmentsStore.getState();
    // The loaded table has a broken unit's blocks, not the unit.
    const loadedIds = (id: string) =>
      shatterIds.parents.has(id) ? [...(parentToChild.get(id) ?? [])] : [id];
    const ids = sorted?.whole.flatMap(([id]) => loadedIds(id)) ?? [];
    const edge = sorted?.edge.map(([id]) => id) ?? [];
    let extraRows: ColumnarTableData | undefined;
    const childLayer = mapDocument.child_layer;
    if (sorted && (!exact || !childLayer)) {
      edge
        .filter(id => inArea(sorted.pointOf.get(id)!, sorted.shape))
        .forEach(id => ids.push(...loadedIds(id)));
    } else if (sorted && childLayer) {
      const broken = edge.filter(id => shatterIds.parents.has(id));
      const unbroken = edge.filter(id => !shatterIds.parents.has(id));
      const side = unbroken.length
        ? (await getDemography({mapDocument, brokenIds: unbroken, childrenOnly: true})).results
        : undefined;
      const brokenBlocks = broken.flatMap(id => [...(parentToChild.get(id) ?? [])]);
      const centers = new Map(
        (
          await getPointSelectionData({
            layer: childLayer,
            columns: ['path', 'x', 'y'],
            source: BLOCK_SOURCE_ID,
            filterIds: new Set([...brokenBlocks, ...(side?.path ?? [])]),
          })
        ).features.map(f => [String(f.properties?.path), f.geometry.coordinates])
      );
      const inside = (path: string) => {
        const center = centers.get(path);
        return !!center && inArea(center, sorted.shape);
      };
      ids.push(...brokenBlocks.filter(inside));
      extraRows = side && pickRows(side, inside);
    }
    const current = useTooltipStore.getState().areaReading;
    if (current?.key !== key || current.exact !== exact) return;
    setAreaReading({key, exact, ids, extraRows, loading: false});
  } catch (error) {
    console.error(error);
    if (useTooltipStore.getState().areaReading?.key === key) setAreaReading(null);
  }
};
