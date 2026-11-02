/**
 * A save marks the map saved only if nothing changed while it ran.
 * Run with `bun test`.
 */
import {afterEach, beforeEach, describe, expect, spyOn, test} from 'bun:test';
import * as putUpdateDocumentModule from './putUpdateDocument';
import * as getAssignmentsModule from './getAssignments';
import * as getDocumentModule from './getDocument';
import {putUpdateAssignmentsAndVerify} from './putUpdateAssignmentsAndVerify';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useMapStore} from '@/app/store/mapStore';
import {idb} from '@/app/utils/idb/idb';

const doc = {document_id: 'd1', districtr_map_slug: 'm', access: 'edit', updated_at: 'T1'} as any;
const SERVER_UPDATED_AT = 'T3';

describe('putUpdateAssignmentsAndVerify', () => {
  let spies: {mockRestore: () => void}[] = [];
  let updateDocument: ReturnType<typeof spyOn>;
  let updateIdbAssignments: ReturnType<typeof spyOn>;
  // Runs while the PUT is in flight, standing in for a stroke or undo landing mid-save.
  let duringPut = () => {};

  beforeEach(() => {
    duringPut = () => {};
    useMapStore.setState({mapDocument: doc});
    useAssignmentsStore.setState({
      zoneAssignments: new Map([['a', 1]]),
      shatterIds: {parents: new Set(), children: new Set()},
      childToParent: new Map(),
      clientLastUpdated: 'T2',
    });
    updateDocument = spyOn(idb, 'updateDocument').mockImplementation(async () => {});
    updateIdbAssignments = spyOn(idb, 'updateIdbAssignments').mockImplementation(() => {});
    spies = [
      updateDocument,
      updateIdbAssignments,
      spyOn(idb, 'flushPendingUpdate').mockImplementation(async () => {}),
      spyOn(putUpdateDocumentModule, 'putUpdateDocument').mockImplementation((async () => {
        duringPut();
        return {ok: true, response: {updated_at: SERVER_UPDATED_AT}};
      }) as any),
      spyOn(getAssignmentsModule, 'getAssignments').mockImplementation((async () => ({
        ok: true,
        response: [{geo_id: 'a', zone: 1}],
      })) as any),
      spyOn(getDocumentModule, 'getDocument').mockImplementation((async () => ({
        ok: false,
      })) as any),
    ];
    // Another test file may already have spied on idb; start each count at zero.
    updateDocument.mockClear();
    updateIdbAssignments.mockClear();
  });
  afterEach(() => spies.forEach(spy => spy.mockRestore()));

  const save = () => {
    const {zoneAssignments, shatterIds, childToParent} = useAssignmentsStore.getState();
    return putUpdateAssignmentsAndVerify({
      mapDocument: doc,
      zoneAssignments,
      shatterIds,
      childToParent,
    });
  };

  test('with no edit during the save, the map is marked saved', async () => {
    expect((await save()).ok).toBe(true);
    expect(useAssignmentsStore.getState().clientLastUpdated).toBe(SERVER_UPDATED_AT);
    expect(useMapStore.getState().mapDocument?.updated_at).toBe(SERVER_UPDATED_AT);
    expect(updateDocument.mock.calls[0][0].clientLastUpdated).toBe(SERVER_UPDATED_AT);
    expect(updateIdbAssignments).not.toHaveBeenCalled();
  });

  test('an edit during the save stays unsaved, in the store and in IndexedDB', async () => {
    const edited = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    duringPut = () =>
      useAssignmentsStore.setState({zoneAssignments: edited, clientLastUpdated: 'T2-edit'});

    expect((await save()).ok).toBe(true);
    const {clientLastUpdated} = useAssignmentsStore.getState();
    expect(useMapStore.getState().mapDocument?.updated_at).toBe(SERVER_UPDATED_AT);
    expect(clientLastUpdated).not.toBe(SERVER_UPDATED_AT);
    // The server's assignments (without the edit) are never written as clean.
    expect(updateDocument).not.toHaveBeenCalled();
    const [metadata, assignments, idbClientLastUpdated] = updateIdbAssignments.mock.calls[0];
    expect(metadata.updated_at).toBe(SERVER_UPDATED_AT);
    expect(assignments).toBe(edited);
    expect(idbClientLastUpdated).toBe(clientLastUpdated);
  });

  test('an undo back to the last saved state during the save stays unsaved', async () => {
    // Undoing the first edit after a save restores the old server stamp.
    duringPut = () => useAssignmentsStore.setState({clientLastUpdated: 'T1'});

    expect((await save()).ok).toBe(true);
    const {clientLastUpdated} = useAssignmentsStore.getState();
    expect(clientLastUpdated).not.toBe('T1');
    expect(clientLastUpdated).not.toBe(SERVER_UPDATED_AT);
    expect(updateDocument).not.toHaveBeenCalled();
  });
});
