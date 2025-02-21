import {demographyCache} from '../store/demographCache';
import {MapStore} from '../store/mapStore';

export const calcPops = (zoneAssignments: MapStore['zoneAssignments']) => {
  const zonePops: Record<number, number> = {};
  zoneAssignments.forEach((zone, id) => {
    if (zone !== null) {
      const pop = +demographyCache.entries[id]?.total_pop;
      if (!pop) return;
      zonePops[+zone] = (zonePops[+zone] || 0) + pop;
    }
  });
  const formattedPops = Object.entries(zonePops).map(([zone, pop]) => ({
    zone: +zone,
    total_pop: pop,
  }));
  return formattedPops;
};
