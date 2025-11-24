import {AssignmentsStore} from '@/app/store/assignmentsStore';
import {Assignment} from '../api/apiHandlers/types';
import {StoredDocument} from '../idb/idb';
import {NullableZone} from '@/app/constants/types';

export const formatAssignmentsFromState = (
  document_id: string,
  zoneAssignments: AssignmentsStore['zoneAssignments'],
  shatterIds: AssignmentsStore['shatterIds'],
  shatterMappings: AssignmentsStore['shatterMappings']
) => {
  const assignments: Assignment[] = [];
  for (const [geo_id, zone] of zoneAssignments.entries()) {
    let parent_path = null;
    if (shatterIds.children.has(geo_id)) {
      parent_path =
        Object.entries(shatterMappings).find(([_, children]) => children.has(geo_id))?.[0] ?? null;
    }
    assignments.push({
      document_id,
      geo_id,
      zone,
      parent_path,
    });
  }
  return assignments;
};

export const formatAssignmentsFromDocument = (assignments: Assignment[]) => {
  const zoneAssignments = new Map<string, NullableZone>();
  const shatterIds = {
    parents: new Set<string>(),
    children: new Set<string>(),
  };
  const shatterMappings: Record<string, Set<string>> = {};
  for (const assignment of assignments) {
    zoneAssignments.set(assignment.geo_id, assignment.zone);
    if (assignment.parent_path) {
      shatterIds.parents.add(assignment.parent_path);
      shatterIds.children.add(assignment.geo_id);
      if (!shatterMappings[assignment.parent_path]) {
        shatterMappings[assignment.parent_path] = new Set([assignment.geo_id]);
      } else {
        shatterMappings[assignment.parent_path].add(assignment.geo_id);
      }
    }
  }
  return {zoneAssignments, shatterIds, shatterMappings} as const;
};
