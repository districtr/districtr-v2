import {NullableZone} from '@constants/types';
import {useMapStore} from '@store/mapStore';
import {Assignment} from './types';

export const lastSentAssignments = new Map<string, NullableZone>();

export const FormatAssignments = () => {
  // track the geoids that have been painted, but are now not painted
  const {allPainted, shatterIds} = useMapStore.getState();
  const assignmentsVisited = new Set([...allPainted]);
  const assignments: Assignment[] = [];
  const subZoneAssignments = new Map();

  Array.from(useMapStore.getState().zoneAssignments.entries()).forEach(
    // @ts-ignore
    ([geo_id, zone]: [string, number]): {
      document_id: string;
      geo_id: string;
      zone: NullableZone;
    } => {
      assignmentsVisited.delete(geo_id);
      if (lastSentAssignments.get(geo_id) !== zone) {
        lastSentAssignments.set(geo_id, zone);
        subZoneAssignments.set(geo_id, zone);
        assignments.push({
          document_id: useMapStore.getState().mapDocument?.document_id || '',
          geo_id,
          zone,
        });
      }
    }
  );
  // fill in with nulls removes assignments from backend
  // otherwise the previous assignment remains
  assignmentsVisited.forEach(geo_id => {
    if (lastSentAssignments.get(geo_id) !== null && !shatterIds.parents.has(geo_id)) {
      lastSentAssignments.set(geo_id, null);
      assignments.push({
        document_id: useMapStore.getState().mapDocument?.document_id || '',
        geo_id,
        // @ts-ignore assignment wants to be number
        zone: null,
      });
      subZoneAssignments.set(geo_id, null);
    }
  });
  return assignments;
};
