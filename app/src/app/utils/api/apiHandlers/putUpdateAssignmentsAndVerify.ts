import {NullableZone} from '@constants/map/zone';
import {formatAssignmentsFromState} from '../../map/formatAssignments';
import {hashAssignments} from '../../map/hashAssignments';
import {Assignment, DocumentObject} from './types';
import {putUpdateDocument} from './putUpdateDocument';
import {getDocument} from './getDocument';
import {AssignmentsStore} from '@/app/store/assignmentsStore';
import {idb} from '../../idb/idb';
import {getAssignments} from './getAssignments';
import {useMapStore} from '@/app/store/mapStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {aliasesWithin, normalizeZoneOrder} from '../../zoneLabels';

type PutUpdateAssignmentsAndVerifyResponse =
  | {
      ok: true;
      response: {
        updated_at: string;
        /** An edit landed while the save was in flight: the map stays dirty and the
         * next save sends it, so callers mustn't mark it clean or announce a save. */
        superseded?: boolean;
      };
    }
  | {
      ok: false;
      error: string;
      /** HTTP status when the server refused the save. */
      status?: number;
    };
export const putUpdateAssignmentsAndVerify = async ({
  mapDocument,
  zoneAssignments,
  shatterIds,
  childToParent,
  overwrite = false,
  clientLastUpdatedAtStart = useAssignmentsStore.getState().clientLastUpdated,
}: {
  mapDocument: DocumentObject;
  zoneAssignments: Map<string, NullableZone>;
  shatterIds: AssignmentsStore['shatterIds'];
  childToParent: AssignmentsStore['childToParent'];
  overwrite?: boolean;
  /** The client clock when the caller read the state being saved; an edit after it
   * means this save is superseded. */
  clientLastUpdatedAtStart?: string;
}): Promise<PutUpdateAssignmentsAndVerifyResponse> => {
  // The user may leave this map mid-save; then only its IndexedDB copy gets the
  // result, and the map now open keeps its own state.
  const stillOpen = () =>
    useMapStore.getState().mapDocument?.document_id === mapDocument.document_id;
  // The sidebar stays live during a save (a paint the save lock ended, an alias, a
  // description, an undo). Any of them changes clientLastUpdated, and then the
  // server doesn't have it.
  const editedDuringSave = () =>
    stillOpen() && useAssignmentsStore.getState().clientLastUpdated !== clientLastUpdatedAtStart;
  // IndexedDB's own stamp for this map, against edits that reach it without
  // moving the store's clock (or after the user left the map). Flushed first: a
  // pending debounced write is from an edit this save carries.
  await idb.flushPendingUpdate();
  const idbClientLastUpdatedAtStart = (await idb.getDocument(mapDocument.document_id))
    ?.clientLastUpdated;
  // What this save sends: the store's map can change while it runs.
  const sent = new Map(zoneAssignments);
  // Build comments payload from document_comments
  const comments = (mapDocument.document_comments || []).map(c => {
    // Only send comment_id when it is a server-assigned integer. Unsaved notes
    // carry crypto.randomUUID() ids; parseInt("3f25…") would yield 3, a real
    // row id, and overwrite another zone's note (same guard as the COI twin).
    const raw = c.comment_id;
    const parsedId =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string' && /^\d+$/.test(raw)
          ? parseInt(raw, 10)
          : undefined;
    return {
      comment_id: parsedId,
      zone: c.zone ?? undefined,
      text: c.text,
    };
  });

  const numDistricts = mapDocument.num_districts ?? 0;
  const assignmentsPostResponse = await putUpdateDocument({
    assignments: formatAssignmentsFromState(
      mapDocument.document_id,
      sent,
      shatterIds,
      childToParent,
      'assignment_array'
    ),
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
      // {} and [] rather than null for "none": the server reads null as "leave
      // them", which would keep another tab's after a "Use local" overwrite. Only
      // the plan's districts are sent (the server refuses others).
      zone_aliases: aliasesWithin(mapDocument.map_metadata?.zone_aliases, numDistricts),
      zone_order: mapDocument.map_metadata?.zone_order?.length
        ? normalizeZoneOrder(mapDocument.map_metadata.zone_order, numDistricts)
        : [],
    },
    comments,
  });
  if (!assignmentsPostResponse.ok) {
    return {
      ok: false,
      error: assignmentsPostResponse.error.detail,
      status: assignmentsPostResponse.error.status,
    };
  }
  // Verify assignments were saved correctly. The server already accepted the write
  // above, so throwing here would leave clientLastUpdated / mapDocument.updated_at
  // unadvanced and surface a spurious "unsaved changes" + conflict modal next save.
  // Return {ok: false} so the caller can surface the mismatch without rolling back.
  const serverHash = assignmentsPostResponse.response.assignments_hash;
  const localHash = serverHash ? await hashAssignments(sent) : null;
  let savedAssignments: Assignment[];
  if (serverHash && localHash) {
    if (serverHash !== localHash) {
      return {ok: false, error: 'Conflict on save: server state differs from this map.'};
    }
    savedAssignments = formatAssignmentsFromState(
      mapDocument.document_id,
      sent,
      shatterIds,
      childToParent,
      'assignment'
    );
  } else {
    // No hash to compare (a server without them, or no WebCrypto): download the
    // plan and compare it instead.
    const freshServerAssignments = await getAssignments(mapDocument);
    if (!freshServerAssignments.ok) {
      return {
        ok: false,
        error: 'Failed to get fresh server assignments',
      };
    }
    const mismatch = freshServerAssignments.response.find(
      assignment => assignment.zone !== sent.get(assignment.geo_id)
    );
    if (mismatch) {
      return {
        ok: false,
        error: `Conflict on save: server state differs (e.g., geo_id ${mismatch.geo_id}).`,
      };
    }
    savedAssignments = freshServerAssignments.response;
  }
  // Refetch document to get server-assigned comment_ids for district comments
  const freshDoc = await getDocument(mapDocument.document_id);
  const document_comments = freshDoc.ok ? freshDoc.response.document_comments : undefined;

  // Verify comment metadata (zone, text) matches expected before updating idb. The
  // server may trim or drop comments (per-map limits); we record those mismatches so the caller
  // can surface a toast rather than leaving users guessing why their text changed.
  let commentsAdjusted = false;
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
        commentsAdjusted = true;
      }
      expectedList.forEach((exp, i) => {
        const fresh = freshList[i];
        if (fresh && exp.text !== fresh.text) {
          console.warn(
            `Comment text mismatch for zone ${zone} index ${i}: expected "${exp.text}", got "${fresh.text}"`
          );
          commentsAdjusted = true;
        }
      });
    }
  }
  if (commentsAdjusted) {
    useMapStore.getState().setNotification({
      importance: 2,
      message:
        "Some district descriptions were adjusted to fit this map's limits. Latest versions shown below.",
      id: `comment-adjusted-${assignmentsPostResponse.response.updated_at}`,
    });
  }

  const updated_at = assignmentsPostResponse.response.updated_at;
  const documentMetadata = {
    ...mapDocument,
    updated_at,
    ...(document_comments && {document_comments}),
  };
  let wroteCleanCopy = false;
  if (!editedDuringSave()) {
    // A debounced write still pending landed after the save started; flushed so
    // the check below sees it rather than having it land on the clean copy.
    await idb.flushPendingUpdate();
    wroteCleanCopy = await idb.updateDocumentIfUnchanged(
      {
        id: mapDocument.document_id,
        document_metadata: documentMetadata,
        assignments: savedAssignments,
        clientLastUpdated: updated_at,
      },
      idbClientLastUpdatedAtStart
    );
  }
  if (!stillOpen()) return {ok: true, response: {updated_at}};
  // Pause zundo before syncing clientLastUpdated to the server timestamp.
  // setClientLastUpdated triggers temporalDiff, which would otherwise treat this
  // server-sync as a user edit: pushing a snapshot onto pastStates and clearing
  // futureStates, corrupting undo/redo history after a save.
  useAssignmentsStore.temporal.getState().pause();
  useCoiAssignmentsStore.temporal.getState().pause();
  // Checked again: the IndexedDB write above awaits. An edit IndexedDB saw but
  // the store's clock didn't (a color change, an undo back to an earlier stamp)
  // also keeps the map unsaved.
  const superseded = editedDuringSave() || !wroteCleanCopy;
  if (!superseded) {
    useAssignmentsStore.getState().setClientLastUpdated(updated_at);
  } else {
    // Keep the edit unsaved, in the store and in IndexedDB (under the new
    // updated_at, so a reload doesn't see a conflict). The fresh stamp also tells
    // the autosave hook to start a new cycle, even when an undo restored the stamp
    // of the last save.
    const clientLastUpdated = new Date().toISOString();
    useAssignmentsStore.getState().setClientLastUpdated(clientLastUpdated);
    // The document as it is now (it may hold that edit), over the saved one's
    // fields the store's copy lacks.
    idb.updateIdbAssignments(
      {...documentMetadata, ...useMapStore.getState().mapDocument!, updated_at},
      useAssignmentsStore.getState().zoneAssignments,
      clientLastUpdated,
      true
    );
  }
  useAssignmentsStore.temporal.getState().resume();
  useCoiAssignmentsStore.temporal.getState().resume();
  if (superseded) {
    // The current document may hold an edit this save didn't send (an alias, a
    // description), so take only the new server timestamp and stay dirty.
    useMapStore.getState().mutateMapDocument({updated_at});
    return {ok: true, response: {updated_at, superseded: true}};
  }
  useMapStore.getState().mutateMapDocument({
    updated_at,
    ...(document_comments && {document_comments}),
  });
  useMapStore.getState().clearUpdatedChanges();
  return {ok: true, response: {updated_at}};
};
