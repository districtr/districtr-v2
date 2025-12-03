import {NullableZone} from '@/app/constants/types';
import {formatAssignmentsFromState} from '../../map/formatAssignments';
import {DocumentObject} from './types';
import {postUpdateAssignments} from './postUpdateAssignments';
import {AssignmentsStore} from '@/app/store/assignmentsStore';
import {idb} from '../../idb/idb';
import {getAssignments} from './getAssignments';
import { useMapStore } from '@/app/store/mapStore';

type PostUpdateAssignmentsAndVerifyResponse =
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
export const postUpdateAssignmentsAndVerify = async ({
  mapDocument,
  zoneAssignments,
  shatterIds,
  shatterMappings,
  overwrite = false,
}: {
  mapDocument: DocumentObject;
  zoneAssignments: Map<string, NullableZone>;
  shatterIds: AssignmentsStore['shatterIds'];
  shatterMappings: AssignmentsStore['shatterMappings'];
  overwrite?: boolean;
}): Promise<PostUpdateAssignmentsAndVerifyResponse> => {
  const formattedAssignments = formatAssignmentsFromState(
    mapDocument.document_id,
    zoneAssignments,
    shatterIds,
    shatterMappings
  );
  const assignmentsPostResponse = await postUpdateAssignments({
    assignments: formattedAssignments,
    document_id: mapDocument.document_id,
    last_updated_at: mapDocument.updated_at!,
    overwrite,
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
  await idb.updateDocument({
    id: mapDocument.document_id,
    document_metadata: {
      ...mapDocument,
      updated_at: assignmentsPostResponse.response.updated_at,
    },
    assignments: freshServerAssignments.response,
    clientLastUpdated: assignmentsPostResponse.response.updated_at,
  });
  useMapStore.getState().mutateMapDocument({
    updated_at: assignmentsPostResponse.response.updated_at,
  });
  return {
    ok: true,
    response: {
      updated_at: assignmentsPostResponse.response.updated_at,
    },
  };
};
