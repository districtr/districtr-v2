import {AssignmentsStore} from '@/app/store/assignmentsStore';
import {Assignment, AssignmentArray} from '../api/apiHandlers/types';
import {NullableZone} from '@/app/constants/types';

export function formatAssignmentsFromState(
  document_id: string,
  zoneAssignments: AssignmentsStore['zoneAssignments'],
  shatterIds: AssignmentsStore['shatterIds'],
  shatterMappings: AssignmentsStore['shatterMappings'],
  type: 'assignment'
): Assignment[];

export function formatAssignmentsFromState(
  document_id: string,
  zoneAssignments: AssignmentsStore['zoneAssignments'],
  shatterIds: AssignmentsStore['shatterIds'],
  shatterMappings: AssignmentsStore['shatterMappings'],
  type: 'assignment_array'
): AssignmentArray[];

export function formatAssignmentsFromState(
  document_id: string,
  zoneAssignments: AssignmentsStore['zoneAssignments'],
  shatterIds: AssignmentsStore['shatterIds'],
  shatterMappings: AssignmentsStore['shatterMappings'],
  type: 'assignment' | 'assignment_array'
): Assignment[] | AssignmentArray[] {
  switch (type) {
    case 'assignment': {
      const assignments: Assignment[] = [];
      for (const [geo_id, zone] of zoneAssignments.entries()) {
        let parent_path = null;
        if (shatterIds.children.has(geo_id)) {
          parent_path =
            Object.entries(shatterMappings).find(([_, children]) => children.has(geo_id))?.[0] ??
            null;
        }
        assignments.push({
          document_id,
          geo_id,
          zone,
          parent_path,
        });
      }
      return assignments;
    }
    case 'assignment_array': {
      const assignments: AssignmentArray[] = [];
      for (const [geo_id, zone] of zoneAssignments.entries()) {
        assignments.push([geo_id, zone]);
      }
      return assignments;
    }
    default: {
      throw new Error(`Invalid type: ${type}`);
    }
  }
}

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
