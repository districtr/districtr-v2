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
