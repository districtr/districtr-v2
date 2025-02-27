import {table, op} from 'arquero';
import {demographyCache} from '../store/demographCache';
import {MapStore} from '../store/mapStore';
import {useChartStore} from '../store/chartStore';

export const calcPops = (zoneAssignments: MapStore['zoneAssignments']) => {
  if (!demographyCache.table) return [];
  const t0 = performance.now();
  const rows = zoneAssignments.size;
  const zoneColumns = {
    path: new Array(rows),
    zone: new Array(rows),
  };
  (zoneAssignments.entries() as any).forEach(([k, v]: any) => {
    if (!k || !v) return;
    zoneColumns.path.push(k);
    zoneColumns.zone.push(v);
  });
  const zoneTable = table(zoneColumns);
  console.log('Created zone table in', performance.now() - t0);
  const formattedPops = zoneTable
    .join_left(demographyCache.table, ['path', 'path'])
    .groupby('zone')
    .rollup({total_pop: op.sum('total_pop')})
    .objects();
  console.log('Calculated populations in', performance.now() - t0);
  return formattedPops;
};

export const updatePops = (zoneAssignments: MapStore['zoneAssignments']) =>
  useChartStore.getState().setMapMetrics({
    data: calcPops(zoneAssignments),
  } as any);
