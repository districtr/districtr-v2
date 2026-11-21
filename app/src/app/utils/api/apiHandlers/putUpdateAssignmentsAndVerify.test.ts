/**
 * A save marks the map saved only if nothing changed while it ran.
 * Run with `bun test`.
 */
import {afterEach, beforeEach, describe, expect, spyOn, test} from 'bun:test';
import * as putUpdateDocumentModule from './putUpdateDocument';
import * as getAssignmentsModule from './getAssignments';
import * as getDocumentModule from './getDocument';
import {putUpdateAssignmentsAndVerify} from './putUpdateAssignmentsAndVerify';
import {hashAssignments} from '../../map/hashAssignments';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useMapStore} from '@/app/store/mapStore';
import {idb} from '@/app/utils/idb/idb';
import {useChartStore} from '@/app/store/chartStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {MAP_MODES} from '@constants/map/mode';
import {queryClient} from '../queryClient';
import {contiguityQueryKey} from './getContiguity';

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
  let getAssignments: ReturnType<typeof spyOn>;
  let getDocument: ReturnType<typeof spyOn>;
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
      (getAssignments = spyOn(getAssignmentsModule, 'getAssignments').mockImplementation(
        (async () => ({
          ok: true,
          response: [{geo_id: 'a', zone: 1}],
        })) as any
      )),
      (getDocument = spyOn(getDocumentModule, 'getDocument').mockImplementation((async () => ({
        ok: false,
      })) as any)),
    ];
    // Another test file may already have spied on idb; start each count at zero.
    updateIdbAssignments.mockClear();
    getAssignments.mockClear();
  });
  afterEach(() => {
    spies.forEach(spy => spy.mockRestore());
    idb.documents = realDocuments;
    useToolbarStore.setState({superDraw: false});
    useChartStore.setState({
      chartOptions: {...useChartStore.getState().chartOptions, popTuningView: false},
    });
    queryClient.clear();
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

  // With nothing blocking input during a save, these all land while one runs.
  test('a stroke still in progress when the save ends is left to finish', async () => {
    const staged = new Map([['b', 2]]);
    duringPut = () => useAssignmentsStore.setState({accumulatedAssignments: staged});

    const result = await save();
    expect(result.ok && result.response.superseded).toBeFalsy();
    // Saved as sent; the stroke's units wait for its ingest, which dirties the map.
    expect(useAssignmentsStore.getState().clientLastUpdated).toBe(SERVER_UPDATED_AT);
    expect(useAssignmentsStore.getState().accumulatedAssignments).toBe(staged);
    expect(useAssignmentsStore.getState().zoneAssignments).toEqual(new Map([['a', 1]]));
  });

  test("a description written during the save stays, not the server's copy", async () => {
    const withNote = {...doc, document_comments: [{comment_id: 7, zone: 1, text: 'old'}]};
    useMapStore.setState({mapDocument: withNote, updated: {metadata: false, comments: false}});
    getDocument.mockImplementation((async () => ({ok: true, response: withNote})) as any);
    duringPut = () => useMapStore.getState().setZoneDescription(1, 'new');

    const result = await save(withNote);
    expect(result.ok && result.response.superseded).toBe(true);
    expect(useMapStore.getState().mapDocument?.document_comments?.[0].text).toBe('new');
    expect(useMapStore.getState().updated.comments).toBe(true);
    expect(useMapStore.getState().mapDocument?.updated_at).toBe(SERVER_UPDATED_AT);
  });

  test('a district count changed during the save stays unsaved', async () => {
    const counted = {...doc, num_districts: 4, num_districts_modifiable: true};
    useMapStore.setState({mapDocument: counted, updated: {metadata: false, comments: false}});
    duringPut = () => useMapStore.getState().setNumDistricts(5);

    const result = await save(counted);
    expect(result.ok && result.response.superseded).toBe(true);
    expect(putUpdateDocument.mock.calls[0][0].metadata.num_districts).toBe(4);
    expect(useMapStore.getState().mapDocument?.num_districts).toBe(5);
    expect(useMapStore.getState().updated.metadata).toBe(true);
  });

  test("a heal during the save, rewriting the store's map in place, stays unsaved", async () => {
    serverSaves(SERVER_UPDATED_AT, new Map([['a', 1]]));
    duringPut = () => {
      // healParentsIfAllChildrenInSameZone edits the current map before replacing it.
      const current = useAssignmentsStore.getState().zoneAssignments;
      current.delete('a');
      current.set('p', 1);
      useAssignmentsStore.setState({
        zoneAssignments: new Map(current),
        clientLastUpdated: 'T2-heal',
      });
    };

    const result = await save();
    // Checked against what was sent, not the map as it is now.
    expect(result.ok && result.response.superseded).toBe(true);
    expect(putUpdateDocument.mock.calls[0][0].assignments).toEqual([['a', 1]]);
    expect(useAssignmentsStore.getState().clientLastUpdated).not.toBe(SERVER_UPDATED_AT);
  });

  /** The server's reply to a save: a new version, and the hash of `plan`. */
  const serverSaves = (
    updatedAt: string,
    plan: Map<string, number | null>,
    extra: Record<string, unknown> = {}
  ) =>
    putUpdateDocument.mockImplementation((async () => {
      duringPut();
      return {
        ok: true,
        response: {updated_at: updatedAt, assignments_hash: await hashAssignments(plan), ...extra},
      };
    }) as any);

  test('a save the server confirms by hash skips the download', async () => {
    serverSaves(SERVER_UPDATED_AT, new Map([['a', 1]]));
    expect((await save()).ok).toBe(true);
    expect(getAssignments).not.toHaveBeenCalled();
    expect(putUpdateDocument.mock.calls[0][0].assignments).toEqual([['a', 1]]);
    expect(records.get('d1').assignments).toEqual([
      {document_id: 'd1', geo_id: 'a', zone: 1, parent_path: null},
    ]);
  });

  test("a hash that doesn't match fails the save", async () => {
    serverSaves(SERVER_UPDATED_AT, new Map([['a', 9]]));
    expect((await save()).ok).toBe(false);
    expect(records.get('d1').clientLastUpdated).toBe('T2');
  });

  test('a verified save records the plan it sent as the checked one', async () => {
    serverSaves(SERVER_UPDATED_AT, new Map([['a', 1]]));
    await save();
    const {checkedPlan} = useAssignmentsStore.getState();
    expect(checkedPlan?.documentId).toBe('d1');
    expect(checkedPlan?.updatedAt).toBe(SERVER_UPDATED_AT);
    expect(checkedPlan?.zoneAssignments).toEqual(new Map([['a', 1]]));
  });

  test('a superseded save records what it sent, not the edit made since', async () => {
    serverSaves(SERVER_UPDATED_AT, new Map([['a', 1]]));
    duringPut = () =>
      useAssignmentsStore.setState({
        zoneAssignments: new Map([['a', 2]]),
        clientLastUpdated: 'T2-edit',
      });
    await save();
    const {checkedPlan} = useAssignmentsStore.getState();
    expect(checkedPlan?.updatedAt).toBe(SERVER_UPDATED_AT);
    expect(checkedPlan?.zoneAssignments).toEqual(new Map([['a', 1]]));
  });

  test('a save that fails its check, or finishes after the user left, records nothing', async () => {
    useAssignmentsStore.setState({checkedPlan: null});
    serverSaves(SERVER_UPDATED_AT, new Map([['a', 9]]));
    await save();
    expect(useAssignmentsStore.getState().checkedPlan).toBeNull();
    serverSaves(SERVER_UPDATED_AT, new Map([['a', 1]]));
    duringPut = () => useMapStore.setState({mapDocument: {...doc, document_id: 'd2'}});
    await save();
    expect(useAssignmentsStore.getState().checkedPlan).toBeNull();
  });

  const openTuningView = () => {
    // Another test file may have left the map in community mode.
    useMapControlsStore.setState({mapMode: MAP_MODES.DISTRICTS});
    useToolbarStore.setState({superDraw: true});
    useChartStore.setState({
      chartOptions: {...useChartStore.getState().chartOptions, popTuningView: true},
    });
  };
  const seeded = () =>
    queryClient.getQueryData(contiguityQueryKey({...doc, updated_at: SERVER_UPDATED_AT}));
  const CONTIGUITY = {'1': 2};

  test('asks for contiguity only in the tuning view', async () => {
    await save();
    expect(putUpdateDocument.mock.calls[0][0].include_contiguity).toBe(false);
    openTuningView();
    await save();
    expect(putUpdateDocument.mock.calls[1][0].include_contiguity).toBe(true);
    // Super Draw off: no tuning view, whatever the meters' toggle says.
    useToolbarStore.setState({superDraw: false});
    await save();
    expect(putUpdateDocument.mock.calls[2][0].include_contiguity).toBe(false);
  });

  test("a save's contiguity is cached for the version it made", async () => {
    serverSaves(SERVER_UPDATED_AT, new Map([['a', 1]]), {contiguity: CONTIGUITY});
    let cachedWhenKeyTurned: unknown;
    const unsub = useMapStore.subscribe(state => {
      if (state.mapDocument?.updated_at === SERVER_UPDATED_AT) cachedWhenKeyTurned ??= seeded();
    });
    expect((await save()).ok).toBe(true);
    unsub();
    expect(seeded()).toEqual({ok: true, response: CONTIGUITY});
    // Already there when the document's updated_at (the key) moved to it.
    expect(cachedWhenKeyTurned).toEqual({ok: true, response: CONTIGUITY});
  });

  test("a save whose hash doesn't match caches no contiguity", async () => {
    serverSaves(SERVER_UPDATED_AT, new Map([['a', 9]]), {contiguity: CONTIGUITY});
    expect((await save()).ok).toBe(false);
    expect(seeded()).toBeUndefined();
  });

  test('a superseded save still caches its contiguity', async () => {
    serverSaves(SERVER_UPDATED_AT, new Map([['a', 1]]), {contiguity: CONTIGUITY});
    duringPut = () => useAssignmentsStore.setState({clientLastUpdated: 'T2-edit'});
    const result = await save();
    expect(result.ok && result.response.superseded).toBe(true);
    expect(seeded()).toEqual({ok: true, response: CONTIGUITY});
  });
});

describe('hashAssignments', () => {
  // The same plans and digests as HASH_VECTORS in backend/tests/test_main.py, which
  // checks them against Postgres and the Python spec: change both or neither. The
  // second plan's ids sort differently by byte and by locale.
  test.each([
    [
      {b: null, 'vtd:01': 3, a1: 2, a: 1},
      '5940bf54ee31f2308c3798c6f8914405e299cd0bb429762b62214b89835c6362',
    ],
    [
      {Z9: 1, 'a-1': 2, a1: null, a_1: 5, 'vtd:A1': 3, 'vtd:a1': 4},
      'c35bdbacd754d1521e7bce3a6eb2b21df9ac2e8f04e9888845f7d607e996e23f',
    ],
    [{}, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ])('matches the backend for %j', async (plan, digest) => {
    expect(await hashAssignments(new Map<string, number | null>(Object.entries(plan)))).toBe(
      digest
    );
  });
});
