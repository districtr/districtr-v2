/**
 * The district save's map lock: taken unless the save is unlocked (the tuning
 * view's autosaves), and an unlocked save leaves others' locks alone. And the
 * checked plan a load records. Run with `bun test`.
 */
import {afterEach, beforeEach, describe, expect, spyOn, test} from 'bun:test';
import * as verifyModule from '@/app/utils/api/apiHandlers/putUpdateAssignmentsAndVerify';
import * as integrityModule from '@/app/utils/map/assignmentIntegrity';
import {useAssignmentsStore} from './assignmentsStore';
import {useMapStore} from './mapStore';
import {idb} from '@/app/utils/idb/idb';

const doc = {document_id: 'd1', updated_at: 'T1', access: 'edit', map_metadata: {}} as any;
const BREAK_LOCK = {isLocked: true, reason: 'Breaking districts'};

describe('handlePutAssignments map lock', () => {
  let spies: {mockRestore: () => void}[] = [];
  // Runs while the save is in flight; the lock as it was then.
  let duringSave = () => {};
  let lockDuringSave: unknown;

  beforeEach(() => {
    duringSave = () => {};
    lockDuringSave = undefined;
    useMapStore.setState({mapDocument: doc, mapLock: null});
    useAssignmentsStore.setState({clientLastUpdated: 'T2'});
    spies = [
      spyOn(integrityModule, 'checkAssignments').mockImplementation(async () => true),
      spyOn(idb, 'flushPendingUpdate').mockImplementation(async () => {}),
      spyOn(idb, 'getDocument').mockImplementation(
        async () =>
          ({id: 'd1', document_metadata: doc, assignments: [], clientLastUpdated: 'T2'}) as any
      ),
      spyOn(verifyModule, 'putUpdateAssignmentsAndVerify').mockImplementation(async () => {
        duringSave();
        lockDuringSave = useMapStore.getState().mapLock;
        return {ok: true, response: {updated_at: 'T3'}};
      }),
    ];
  });
  afterEach(() => spies.forEach(spy => spy.mockRestore()));

  const autosave = (unlocked: boolean) =>
    useAssignmentsStore.getState().handlePutAssignments(false, {
      silent: true,
      autosave: true,
      unlocked,
    });

  test('an autosave locks the map while it runs', async () => {
    expect((await autosave(false)).ok).toBe(true);
    expect(lockDuringSave).toEqual({isLocked: true, reason: 'Saving plan', silent: true});
    expect(useMapStore.getState().mapLock).toBeNull();
  });

  test("an unlocked save doesn't lock the map", async () => {
    expect((await autosave(true)).ok).toBe(true);
    expect(lockDuringSave).toBeNull();
    expect(useMapStore.getState().mapLock).toBeNull();
  });

  test('a break started during an unlocked save keeps its lock when the save ends', async () => {
    // handleShatter takes the lock and holds it until its blocks arrive.
    duringSave = () => useMapStore.setState({mapLock: BREAK_LOCK});
    await autosave(true);
    expect(useMapStore.getState().mapLock).toEqual(BREAK_LOCK);
  });

  test("an unlocked save during a break doesn't end the break's lock", async () => {
    useMapStore.setState({mapLock: BREAK_LOCK});
    await autosave(true);
    expect(lockDuringSave).toEqual(BREAK_LOCK);
    expect(useMapStore.getState().mapLock).toEqual(BREAK_LOCK);
  });
});

describe('ingestFromDocument checked plan', () => {
  let spies: {mockRestore: () => void}[] = [];
  beforeEach(() => {
    useMapStore.setState({mapDocument: doc});
    spies = [spyOn(idb, 'updateIdbAssignments').mockImplementation(() => {})];
  });
  afterEach(() => spies.forEach(spy => spy.mockRestore()));

  const data = {
    zoneAssignments: new Map([['a', 1]]),
    shatterIds: {parents: new Set<string>(), children: new Set<string>()},
    parentToChild: new Map(),
    childToParent: new Map(),
  };

  test("a load with no local edits is the server's plan for its version", () => {
    useAssignmentsStore.getState().ingestFromDocument(data, doc, false);
    const {checkedPlan, zoneAssignments} = useAssignmentsStore.getState();
    expect(checkedPlan?.updatedAt).toBe('T1');
    expect(checkedPlan?.zoneAssignments).toEqual(new Map([['a', 1]]));
    // Its own copy: a heal rewrites the store's map in place.
    expect(checkedPlan?.zoneAssignments).not.toBe(zoneAssignments);
  });

  test('a load with local edits, or without its document, is not', () => {
    useAssignmentsStore.getState().ingestFromDocument(data, doc, false);
    useAssignmentsStore.getState().ingestFromDocument(data, doc, true);
    expect(useAssignmentsStore.getState().checkedPlan).toBeNull();
    useAssignmentsStore.getState().ingestFromDocument(data, doc, false);
    useAssignmentsStore.getState().ingestFromDocument(data);
    expect(useAssignmentsStore.getState().checkedPlan).toBeNull();
  });
});
