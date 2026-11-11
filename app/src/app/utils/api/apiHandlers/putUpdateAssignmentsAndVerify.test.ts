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

const doc = {
  document_id: 'd1',
  districtr_map_slug: 'm',
  access: 'edit',
  updated_at: 'T1',
  map_metadata: {},
} as any;
const SERVER_UPDATED_AT = 'T3';

// IndexedDB's documents table, in memory: the save's clean-copy write runs its
// real check-and-write against it.
let records: Map<string, any>;
// Runs as a record is written, standing in for an edit landing during that await.
let duringWrite = () => {};
const realDocuments = idb.documents;
const fakeDocuments = {
  get: async (id: string) => records.get(id),
  put: async (record: any) => {
    records.set(record.id, record);
    duringWrite();
  },
} as any;
const localCopy = (clientLastUpdated: string) => ({
  id: 'd1',
  document_metadata: doc,
  assignments: [{document_id: 'd1', geo_id: 'a', zone: 1}],
  clientLastUpdated,
});

describe('putUpdateAssignmentsAndVerify', () => {
  let spies: {mockRestore: () => void}[] = [];
  let updateIdbAssignments: ReturnType<typeof spyOn>;
  let putUpdateDocument: ReturnType<typeof spyOn>;
  // Runs while the PUT is in flight, standing in for a stroke or undo landing mid-save.
  let duringPut = () => {};

  beforeEach(() => {
    duringPut = () => {};
    duringWrite = () => {};
    records = new Map([['d1', localCopy('T2')]]);
    idb.documents = fakeDocuments;
    useMapStore.setState({mapDocument: doc, updated: {metadata: true, comments: false}});
    useAssignmentsStore.setState({
      zoneAssignments: new Map([['a', 1]]),
      shatterIds: {parents: new Set(), children: new Set()},
      childToParent: new Map(),
      clientLastUpdated: 'T2',
    });
    updateIdbAssignments = spyOn(idb, 'updateIdbAssignments').mockImplementation(() => {});
    putUpdateDocument = spyOn(putUpdateDocumentModule, 'putUpdateDocument').mockImplementation(
      (async () => {
        duringPut();
        return {ok: true, response: {updated_at: SERVER_UPDATED_AT}};
      }) as any
    );
    spies = [
      updateIdbAssignments,
      putUpdateDocument,
      spyOn(idb, 'flushPendingUpdate').mockImplementation(async () => {}),
      // Spied, not left to read the fake table: another test file may have left a spy.
      spyOn(idb, 'getDocument').mockImplementation(async id => records.get(id)),
      spyOn(idb, 'transaction').mockImplementation(((...args: any[]) => args.at(-1)()) as any),
      spyOn(getAssignmentsModule, 'getAssignments').mockImplementation((async () => ({
        ok: true,
        response: [{geo_id: 'a', zone: 1}],
      })) as any),
      spyOn(getDocumentModule, 'getDocument').mockImplementation((async () => ({
        ok: false,
      })) as any),
    ];
    // Another test file may already have spied on idb; start each count at zero.
    updateIdbAssignments.mockClear();
  });
  afterEach(() => {
    spies.forEach(spy => spy.mockRestore());
    idb.documents = realDocuments;
  });

  const save = (mapDocument = doc) => {
    const {zoneAssignments, shatterIds, childToParent} = useAssignmentsStore.getState();
    return putUpdateAssignmentsAndVerify({
      mapDocument,
      zoneAssignments,
      shatterIds,
      childToParent,
    });
  };

  test('with no edit during the save, the map is marked saved', async () => {
    expect(await save()).toEqual({ok: true, response: {updated_at: SERVER_UPDATED_AT}});
    expect(useAssignmentsStore.getState().clientLastUpdated).toBe(SERVER_UPDATED_AT);
    expect(useMapStore.getState().mapDocument?.updated_at).toBe(SERVER_UPDATED_AT);
    expect(useMapStore.getState().updated.metadata).toBe(false);
    expect(records.get('d1').clientLastUpdated).toBe(SERVER_UPDATED_AT);
    expect(updateIdbAssignments).not.toHaveBeenCalled();
  });

  test('sends {} and [] when nothing is loaded, so the server clears stale ones', async () => {
    await save();
    expect(putUpdateDocument.mock.calls[0][0].metadata.zone_aliases).toEqual({});
    expect(putUpdateDocument.mock.calls[0][0].metadata.zone_order).toEqual([]);
  });

  test("sends only the plan's districts, so a lowered count can't fail every save", async () => {
    // setNumDistricts leaves zone_order alone; district 5 is gone.
    await save({
      ...doc,
      num_districts: 3,
      map_metadata: {zone_order: [3, 5, 1], zone_aliases: {'1': 'A', '5': 'E'}},
    });
    const {metadata} = putUpdateDocument.mock.calls[0][0];
    expect(metadata.zone_order).toEqual([3, 1, 2]);
    expect(metadata.zone_aliases).toEqual({'1': 'A'});
  });

  test('an edit during the save stays unsaved, in the store and in IndexedDB', async () => {
    const edited = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    duringPut = () =>
      useAssignmentsStore.setState({zoneAssignments: edited, clientLastUpdated: 'T2-edit'});

    const result = await save();
    expect(result.ok && result.response.superseded).toBe(true);
    const {clientLastUpdated} = useAssignmentsStore.getState();
    expect(useMapStore.getState().mapDocument?.updated_at).toBe(SERVER_UPDATED_AT);
    expect(clientLastUpdated).not.toBe(SERVER_UPDATED_AT);
    expect(useMapStore.getState().updated.metadata).toBe(true);
    // The server's assignments (without the edit) are never written as clean.
    expect(records.get('d1').clientLastUpdated).toBe('T2');
    const [metadata, assignments, idbClientLastUpdated] = updateIdbAssignments.mock.calls[0];
    expect(metadata.updated_at).toBe(SERVER_UPDATED_AT);
    expect(assignments).toBe(edited);
    expect(idbClientLastUpdated).toBe(clientLastUpdated);
  });

  test('a label edited during the save is kept in the IndexedDB re-stamp', async () => {
    duringPut = () => {
      useMapStore.setState({mapDocument: {...doc, map_metadata: {zone_aliases: {'1': 'N'}}}});
      useAssignmentsStore.setState({clientLastUpdated: 'T2-edit'});
    };
    await save();
    const [metadata] = updateIdbAssignments.mock.calls[0];
    expect(metadata.map_metadata.zone_aliases).toEqual({'1': 'N'});
    expect(metadata.updated_at).toBe(SERVER_UPDATED_AT);
  });

  test('an undo back to the last saved state during the save stays unsaved', async () => {
    // Undoing the first edit after a save restores the old server stamp.
    duringPut = () => useAssignmentsStore.setState({clientLastUpdated: 'T1'});

    expect((await save()).ok).toBe(true);
    const {clientLastUpdated} = useAssignmentsStore.getState();
    expect(clientLastUpdated).not.toBe('T1');
    expect(clientLastUpdated).not.toBe(SERVER_UPDATED_AT);
    expect(records.get('d1').clientLastUpdated).toBe('T2');
  });

  test('leaving the map mid-save still records the save in its IndexedDB copy only', async () => {
    const other = {...doc, document_id: 'd2', updated_at: 'X'};
    duringPut = () => {
      useMapStore.setState({mapDocument: other});
      useAssignmentsStore.setState({clientLastUpdated: ''});
    };
    const result = await save();
    expect(result.ok && result.response.superseded).toBeFalsy();
    expect(records.get('d1').clientLastUpdated).toBe(SERVER_UPDATED_AT);
    expect(records.has('d2')).toBe(false);
    expect(updateIdbAssignments).not.toHaveBeenCalled();
    // The map now open keeps its own timestamps.
    expect(useMapStore.getState().mapDocument?.updated_at).toBe('X');
    expect(useAssignmentsStore.getState().clientLastUpdated).toBe('');
  });

  test('an edit during the IndexedDB write stays unsaved', async () => {
    duringWrite = () => useAssignmentsStore.setState({clientLastUpdated: 'T2-edit'});

    const result = await save();
    expect(result.ok && result.response.superseded).toBe(true);
    expect(useAssignmentsStore.getState().clientLastUpdated).not.toBe(SERVER_UPDATED_AT);
    expect(updateIdbAssignments).toHaveBeenCalledTimes(1);
  });

  // Review comment 4417177093: edits that reach IndexedDB without moving the
  // store's clock, or after the user left the map, must not be overwritten by
  // the save's clean copy.
  test('an IndexedDB edit the store clock missed keeps the local copy unsaved', async () => {
    // A color change writes IndexedDB without bumping the clock.
    duringPut = () => records.set('d1', {...localCopy('T2-color'), assignments: ['edited']});

    const result = await save();
    expect(result.ok && result.response.superseded).toBe(true);
    // The copy keeps its edit and stamp, under the new server version.
    const copy = records.get('d1');
    expect(copy.assignments).toEqual(['edited']);
    expect(copy.clientLastUpdated).toBe('T2-color');
    expect(copy.document_metadata.updated_at).toBe(SERVER_UPDATED_AT);
    // Still unsaved in the store, and the open map's state is re-stamped locally.
    expect(useAssignmentsStore.getState().clientLastUpdated).not.toBe(SERVER_UPDATED_AT);
    expect(useMapStore.getState().updated.metadata).toBe(true);
    expect(updateIdbAssignments).toHaveBeenCalledTimes(1);
  });

  test("an edit written to a map's copy after the user left it survives the save", async () => {
    const other = {...doc, document_id: 'd2', updated_at: 'X'};
    duringPut = () => {
      // Closing the description bubble on the way out saves its title.
      records.set('d1', {...localCopy('T2-title'), assignments: ['edited']});
      useMapStore.setState({mapDocument: other});
    };

    await save();
    const copy = records.get('d1');
    expect(copy.assignments).toEqual(['edited']);
    expect(copy.clientLastUpdated).toBe('T2-title');
    // Advanced, so reopening the map sees an unsaved edit, not a conflict.
    expect(copy.document_metadata.updated_at).toBe(SERVER_UPDATED_AT);
    expect(useMapStore.getState().mapDocument?.updated_at).toBe('X');
  });
});
