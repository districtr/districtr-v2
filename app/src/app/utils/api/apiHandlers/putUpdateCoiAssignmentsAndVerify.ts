import {DocumentObject} from './types';
import {putUpdateDocument} from './putUpdateDocument';
import {getDocument} from './getDocument';
import {getAssignments} from './getAssignments';
import {idb} from '../../idb/idb';
import {useMapStore} from '@/app/store/mapStore';
import {
  formatCoiAssignmentsFromState,
  formatCoiAssignmentsFromDocument,
} from '../../map/formatCoiAssignments';
import {CoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';

type PutUpdateAssignmentsAndVerifyResponse =
  | {
      ok: true;
      response: {
        updated_at: string;
      };
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Helper function that checks to make sure that the left and right community assignments are
 * the same
 */
const areCommunityAssignmentsEqual = (
  left: Map<number, Set<string>>,
  right: Map<number, Set<string>>
) => {
  if (left.size !== right.size) return false;

  for (const [communityId, leftGeoids] of left) {
    const rightGeoids = right.get(communityId);
    if (!rightGeoids || rightGeoids.size !== leftGeoids.size) return false;
    for (const geoid of leftGeoids) {
      if (!rightGeoids.has(geoid)) return false;
    }
  }

  return true;
};

/**
 * Helper function to make sure that the child to parent maps are the same
 */
const areStringMapsEqual = (left: Map<string, string>, right: Map<string, string>) => {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
};

export const putUpdateCoiAssignmentsAndVerify = async ({
  mapDocument,
  communityAssignments,
  shatterIds,
  childToParent,
  overwrite = false,
}: {
  mapDocument: DocumentObject;
  communityAssignments: Map<number, Set<string>>;
  shatterIds: CoiAssignmentsStore['shatterIds'];
  childToParent: CoiAssignmentsStore['childToParent'];
  overwrite?: boolean;
}): Promise<PutUpdateAssignmentsAndVerifyResponse> => {
  const formattedAssignments = formatCoiAssignmentsFromState(
    mapDocument.document_id,
    communityAssignments,
    shatterIds,
    childToParent
  ).map(assignment => [assignment.geo_id, assignment.zone] as [string, number | null]);

  const comments = (mapDocument.document_comments || []).map(comment => {
    const parsedId = comment.comment_id ? parseInt(String(comment.comment_id), 10) : NaN;
    return {
      comment_id: Number.isFinite(parsedId) ? parsedId : undefined,
      zone: comment.zone ?? undefined,
      text: comment.text,
    };
  });

  const assignmentsPostResponse = await putUpdateDocument({
    assignments: formattedAssignments,
    document_id: mapDocument.document_id,
    last_updated_at: mapDocument.updated_at ?? mapDocument.created_at,
    overwrite,
    map_type: 'community',
    metadata: {
      color_scheme: mapDocument.color_scheme ?? undefined,
      num_communities: mapDocument.num_communities ?? undefined,
      community_metadata_list: mapDocument.community_metadata_list ?? undefined,
    },
    comments,
  });

  if (!assignmentsPostResponse.ok) {
    return {
      ok: false,
      error: assignmentsPostResponse.error.detail,
    };
  }

  const freshServerAssignments = await getAssignments(mapDocument);
  if (!freshServerAssignments.ok) {
    return {
      ok: false,
      error: 'Failed to get fresh server assignments',
    };
  }

  const freshData = formatCoiAssignmentsFromDocument(freshServerAssignments.response);
  const assignmentsMismatch = !areCommunityAssignmentsEqual(
    communityAssignments,
    freshData.communityAssignments
  );
  const shatterMismatch = !areStringMapsEqual(childToParent, freshData.childToParent);

  if (assignmentsMismatch || shatterMismatch) {
    console.warn('[COI save verification] Post-save mismatch detected (PUT succeeded).', {
      assignmentsMismatch,
      shatterMismatch,
      localCommunityCount: communityAssignments.size,
      serverCommunityCount: freshData.communityAssignments.size,
      localShatterCount: childToParent.size,
      serverShatterCount: freshData.childToParent.size,
    });
  }

  const freshDoc = await getDocument(mapDocument.document_id);
  const nextDocumentMetadata = freshDoc.ok
    ? {
        ...mapDocument,
        ...freshDoc.response,
        updated_at: assignmentsPostResponse.response.updated_at,
      }
    : {
        ...mapDocument,
        updated_at: assignmentsPostResponse.response.updated_at,
      };

  await idb.updateDocument({
    id: mapDocument.document_id,
    document_metadata: nextDocumentMetadata,
    assignments: freshServerAssignments.response,
    clientLastUpdated: assignmentsPostResponse.response.updated_at,
  });

  useMapStore.getState().mutateMapDocument(nextDocumentMetadata);
  useMapStore.getState().clearUpdatedChanges();

  return {
    ok: true,
    response: {
      updated_at: assignmentsPostResponse.response.updated_at,
    },
  };
};
