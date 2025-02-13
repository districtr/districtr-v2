import {MapStore} from '../store/mapStore';
import { featureCache } from './featureCache';

export const calcPops = (zoneAssignments: MapStore['zoneAssignments']) => {
  const zonePops: Record<number, number> = {};
  zoneAssignments.forEach((zone, id) => {
    if (zone !== null) {
      const pop = parseInt(featureCache.features?.[id]?.properties?.total_pop as string);
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
