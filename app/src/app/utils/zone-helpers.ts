import {MapStore} from '../store/mapStore';

export const findAssignmentMode = (
  zoneAssignments: MapStore['zoneAssignments'],
  ids: Set<string>
) => {
  const counts = new Map<number | null, number>();
  ids.forEach(id => {
    const assignment = zoneAssignments.get(id) || null;
    const newCount = (counts.get(assignment) || 0) + 1;
    counts.set(assignment, newCount);
  });
  // find max
  return Array.from(counts.entries()).reduce(
    (acc, curr: any) => {
      const currentIsMore = curr[1] > acc.count;
      return {
        count: currentIsMore ? curr[1] : acc.count,
        zone: currentIsMore ? curr[0] : acc.zone,
      };
    },
    {
      zone: -999,
      count: 0,
    }
  );
};

export const calculateMinMaxRange = (data: Array<{zone: number; total_pop: number}>) => {
  const totalPops = data.map(item => item.total_pop);
  const min = Math.min(...totalPops);
  const max = Math.max(...totalPops);
  const range = Math.abs(max - min);
  return {min, max, range};
};
