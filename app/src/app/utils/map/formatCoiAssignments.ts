import {Zone} from '@/app/constants/types';
import {Assignment} from '../api/apiHandlers/types';

type ShatterState = {
  parents: Set<string>;
  children: Set<string>;
};

/**
 * Formats the community assignments from the state into an array of Assignment objects for API
 * submission.
 *
 * @param document_id - The ID of the document.
 * @param communityAssignments - A Map where the key is a Zone and the value is a Set of geo_ids
 * assigned to that Zone.
 * @param shatterIds - An object containing Sets of parent and child geo_ids for shatter
 * assignments.
 * @param childToParent - A Map where the key is a child geo_id and the value is its parent
 * geo_id for shatter assignments.
 * @returns An array of Assignment objects formatted for API submission.
 */
export const formatCoiAssignmentsFromState = (
  document_id: string,
  communityAssignments: Map<Zone, Set<string>>,
  shatterIds: ShatterState,
  childToParent: Map<string, string>
): Assignment[] => {
  const assignments: Assignment[] = [];
  const assignedChildIds = new Set<string>();

  communityAssignments.forEach((geoids, community) => {
    geoids.forEach(geo_id => {
      if (shatterIds.children.has(geo_id)) {
        assignedChildIds.add(geo_id);
      }
      const parent_path = shatterIds.children.has(geo_id)
        ? (childToParent.get(geo_id) ?? null)
        : null;
      assignments.push({
        document_id,
        geo_id,
        zone: community,
        parent_path,
      });
    });
  });

  // Preserve shattered-but-unassigned children so restore can rebuild the full shatter state.
  shatterIds.children.forEach(geo_id => {
    if (assignedChildIds.has(geo_id)) return;
    assignments.push({
      document_id,
      geo_id,
      zone: null,
      parent_path: childToParent.get(geo_id) ?? null,
    });
  });

  return assignments;
};

/**
 * Formats the community assignments from an array of Assignment objects (e.g., from API response)
 * into a structured format for use in the application state.
 *
 * @param assignments - An array of Assignment objects to be formatted.
 * @returns An object containing:
 *   - communityAssignments: A Map where the key is a Zone and the value is a Set of geo_ids
 *     assigned to that Zone.
 *   - shatterIds: An object containing Sets of parent and child geo_ids for shatter assignments.
 *   - parentToChild: A Map where the key is a parent geo_id and the value is a Set of child
 *     geo_ids for shatter assignments.
 *   - childToParent: A Map where the key is a child geo_id and the value is its parent geo_id
 *     for shatter assignments.
 */
export const formatCoiAssignmentsFromDocument = (assignments: Assignment[]) => {
  const communityAssignments = new Map<Zone, Set<string>>();
  const shatterIds: ShatterState = {
    parents: new Set<string>(),
    children: new Set<string>(),
  };
  const parentToChild = new Map<string, Set<string>>();
  const childToParent = new Map<string, string>();

  assignments.forEach(assignment => {
    if (assignment.zone !== null) {
      const community = assignment.zone as Zone;

      if (!communityAssignments.has(community)) {
        communityAssignments.set(community, new Set([assignment.geo_id]));
      } else {
        communityAssignments.get(community)?.add(assignment.geo_id);
      }
    }

    if (assignment.parent_path) {
      shatterIds.parents.add(assignment.parent_path);
      shatterIds.children.add(assignment.geo_id);

      if (!parentToChild.has(assignment.parent_path)) {
        parentToChild.set(assignment.parent_path, new Set([assignment.geo_id]));
      } else {
        parentToChild.get(assignment.parent_path)?.add(assignment.geo_id);
      }

      childToParent.set(assignment.geo_id, assignment.parent_path);
    }
  });

  return {communityAssignments, shatterIds, parentToChild, childToParent} as const;
};
