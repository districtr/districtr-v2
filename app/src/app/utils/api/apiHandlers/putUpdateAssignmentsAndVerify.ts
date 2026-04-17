import {NullableZone} from '@constants/map/zone';
import {formatAssignmentsFromState} from '../../map/formatAssignments';
import {AssignmentArray, DocumentObject} from './types';
import {putUpdateDocument} from './putUpdateDocument';
import {getDocument} from './getDocument';
import {AssignmentsStore} from '@/app/store/assignmentsStore';
import {idb} from '../../idb/idb';
import {getAssignments} from './getAssignments';
import {useMapStore} from '@/app/store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';

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
export const putUpdateAssignmentsAndVerify = async ({
  mapDocument,
  zoneAssignments,
  shatterIds,
  childToParent,
  overwrite = false,
}: {
  mapDocument: DocumentObject;
  zoneAssignments: Map<string, NullableZone>;
  shatterIds: AssignmentsStore['shatterIds'];
  childToParent: AssignmentsStore['childToParent'];
  overwrite?: boolean;
}): Promise<PutUpdateAssignmentsAndVerifyResponse> => {
  const formattedAssignments = formatAssignmentsFromState(
    mapDocument.document_id,
    zoneAssignments,
    shatterIds,
    childToParent,
    'assignment_array'
  );
  // Build comments payload from document_comments
  const comments = (mapDocument.document_comments || []).map(c => {
    // Only send comment_id if it's a server-assigned integer
    const parsedId = c.comment_id ? parseInt(String(c.comment_id), 10) : NaN;
    return {
      comment_id: Number.isFinite(parsedId) ? parsedId : undefined,
      zone: c.zone ?? undefined,
      text: c.text,
    };
  });

  const assignmentsPostResponse = await putUpdateDocument({
    assignments: formattedAssignments,
    document_id: mapDocument.document_id,
    last_updated_at: mapDocument.updated_at!,
    overwrite,
    // TODO: Have metadata confirmed after put and make it possible to update metadata without assignments
    metadata: {
      color_scheme: mapDocument.color_scheme ?? undefined,
      num_districts:
        mapDocument.num_districts && mapDocument.num_districts_modifiable
          ? mapDocument.num_districts
          : undefined,
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
  // Verify assignments were saved correctly
  freshServerAssignments.response.forEach(assignment => {
    if (assignment.zone !== zoneAssignments.get(assignment.geo_id)) {
      throw new Error('Conflict on save: assignments mismatch');
    }
  });
  // Refetch document to get server-assigned comment_ids for district comments
  const freshDoc = await getDocument(mapDocument.document_id);
  const document_comments = freshDoc.ok ? freshDoc.response.document_comments : undefined;

  // Verify comment metadata (zone, text) matches expected before updating idb
  if (document_comments) {
    const expectedComments = mapDocument.document_comments || [];
    const expectedByZone = new Map<number, {text: string}[]>();
    expectedComments.forEach(c => {
      if (c.zone != null) {
        const list = expectedByZone.get(c.zone) ?? [];
        list.push({text: (c.text ?? '').trim()});
        expectedByZone.set(c.zone, list);
      }
    });
    const freshByZone = new Map<number, {text: string}[]>();
    document_comments.forEach(c => {
      if (c.zone != null) {
        const list = freshByZone.get(c.zone) ?? [];
        list.push({text: (c.text ?? '').trim()});
        freshByZone.set(c.zone, list);
      }
    });
    for (const [zone, expectedList] of expectedByZone) {
      const freshList = freshByZone.get(zone) ?? [];
      if (freshList.length !== expectedList.length) {
        console.warn(
          `Comment count mismatch for zone ${zone}: expected ${expectedList.length}, got ${freshList.length}`
        );
      }
      expectedList.forEach((exp, i) => {
        const fresh = freshList[i];
        if (fresh && exp.text !== fresh.text) {
          // Server may trim or moderate; log but allow update
          console.warn(
            `Comment text mismatch for zone ${zone} index ${i}: expected "${exp.text}", got "${fresh.text}"`
          );
        }
      });
    }
  }

  await idb.updateDocument({
    id: mapDocument.document_id,
    document_metadata: {
      ...mapDocument,
      updated_at: assignmentsPostResponse.response.updated_at,
      ...(document_comments && {document_comments}),
    },
    assignments: freshServerAssignments.response,
    clientLastUpdated: assignmentsPostResponse.response.updated_at,
  });
  useAssignmentsStore.getState().setClientLastUpdated(assignmentsPostResponse.response.updated_at);
  useMapStore.getState().mutateMapDocument({
    updated_at: assignmentsPostResponse.response.updated_at,
    ...(document_comments && {document_comments}),
  });
  useMapStore.getState().clearUpdatedChanges();
  return {
    ok: true,
    response: {
      updated_at: assignmentsPostResponse.response.updated_at,
    },
  };
};
