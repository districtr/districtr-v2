import {beforeEach, describe, expect, mock, spyOn, test} from 'bun:test';
import {
  checkAssignments,
  districtSnapshot,
  findAssignmentIssues,
  findNewIssueIds,
  hasIssues,
  planRepair,
  repairAssignments,
  suggestParentAssignmentChoice,
} from './assignmentIntegrity';
import {useAssignmentRepairStore} from '@/app/store/assignmentRepairStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {idb} from '@/app/utils/idb/idb';
import {demographyService} from '@/app/utils/demography/demographyService';

// mock.module updates already-imported bindings in place, so assignmentIntegrity's
// getChildEdges import points at this mock.
const edgesMock = mock(async () => [] as {parent_path: string; child_path: string}[]);
mock.module('../api/apiHandlers/getChildEdges', () => ({getChildEdges: edgesMock}));

const doc = {document_id: 'd1', districtr_map_slug: 'm', access: 'edit', updated_at: 'x'} as any;
// Stores are singletons; repair tests swap in a stub save, so restore the real ones.
const realDistrictSave = useAssignmentsStore.getState().handlePutAssignments;
const realCoiSave = useCoiAssignmentsStore.getState().handlePutAssignments;
const noIssues = {parentAssignments: [], missingBlocks: new Map(), unmatched: [], unverified: []};

// vtd:A and vtd:B are broken up and both still saved whole; ghost has no demography row.
const districtState = () => ({
  zoneAssignments: new Map<string, number | null>([
    ['vtd:A', 1],
    ['a1', 2],
    ['vtd:B', 3],
    ['b1', 3],
    ['ghost', 1],
  ]),
  shatterIds: {parents: new Set(['vtd:A', 'vtd:B']), children: new Set(['a1', 'b1'])},
  parentToChild: new Map([
    ['vtd:A', new Set(['a1'])],
    ['vtd:B', new Set(['b1'])],
  ]),
  childToParent: new Map([
    ['a1', 'vtd:A'],
    ['b1', 'vtd:B'],
  ]),
});
// The backend says vtd:A also has a2, which the map never saved.
const blocksByParent = new Map([
  ['vtd:A', ['a1', 'a2']],
  ['vtd:B', ['b1']],
]);
// What a check of districtState() (with ghost unmatched) shows the user.
const repairIssues = {
  documentId: 'd1',
  parentAssignments: ['vtd:A', 'vtd:B'],
  missingBlocks: new Map([['vtd:A', ['a2']]]),
  unmatched: ['ghost'],
  unverified: [],
  blocksByParent,
};
const choices = {'vtd:A': 'blocks', 'vtd:B': 'whole'} as const;

beforeEach(() => {
  edgesMock.mockReset();
  edgesMock.mockImplementation(async () => []);
  useMapStore.setState({mapDocument: doc});
  useAssignmentsStore.setState({handlePutAssignments: realDistrictSave});
  useCoiAssignmentsStore.setState({handlePutAssignments: realCoiSave});
  useMapControlsStore.setState({mapMode: 'districts'} as any);
  useAssignmentRepairStore.setState({
    issues: null,
    open: false,
    dismissedFor: null,
    choices: {},
    newIds: [],
  });
  demographyService.unmatchedPaths = [];
  spyOn(idb, 'updateIdbAssignments').mockImplementation(() => {});
  spyOn(idb, 'updateIdbCoiAssignments').mockImplementation(() => {});
  spyOn(demographyService, 'updatePopulations').mockImplementation(() => true);
});

describe('findAssignmentIssues', () => {
  test('the local pass finds whole-unit assignments and unmatched units', () => {
    const found = findAssignmentIssues(districtSnapshot(districtState()), [
      'ghost',
      'vtd:A', // broken up, so reported as a whole-unit assignment instead
      'gone', // no longer assigned
    ]);
    expect(found).toEqual({
      parentAssignments: ['vtd:A', 'vtd:B'],
      unmatched: ['ghost'],
      missingBlocks: new Map(),
      unverified: [],
    });
  });

  test('a null-zone whole-unit assignment still counts', () => {
    const st = districtState();
    st.zoneAssignments.set('vtd:A', null);
    expect(findAssignmentIssues(districtSnapshot(st), []).parentAssignments).toEqual([
      'vtd:A',
      'vtd:B',
    ]);
  });

  test('with blocks, reports missing ones and units with none listed as unverified', () => {
    const found = findAssignmentIssues(
      districtSnapshot(districtState()),
      [],
      new Map([['vtd:A', ['a1', 'a2']]])
    );
    expect([...found.missingBlocks]).toEqual([['vtd:A', ['a2']]]);
    expect(found.unverified).toEqual(['vtd:B']);
  });
});

describe('pure helpers', () => {
  test('suggests keeping blocks only when some block carries an assignment', () => {
    const assigned = new Set(['a2']);
    const hasZone = (id: string) => assigned.has(id);
    expect(suggestParentAssignmentChoice(['a1', 'a2'], hasZone)).toBe('blocks');
    expect(suggestParentAssignmentChoice(['b1', 'b2'], hasZone)).toBe('whole');
  });

  test('hasIssues counts each kind of finding', () => {
    expect(hasIssues({...noIssues, unverified: ['vtd:A']})).toBe(false);
    expect(hasIssues({...noIssues, parentAssignments: ['vtd:A']})).toBe(true);
    expect(hasIssues({...noIssues, unmatched: ['x']})).toBe(true);
    expect(hasIssues({...noIssues, missingBlocks: new Map([['p', ['b']]])})).toBe(true);
  });

  test('planRepair follows each choice; a unit made whole needs no missing blocks', () => {
    expect(planRepair(repairIssues, choices)).toEqual({
      keepWhole: ['vtd:B'],
      dropAssignments: ['vtd:A', 'ghost'],
      addBlocks: new Map([['vtd:A', ['a2']]]),
    });
    expect(planRepair(repairIssues, {'vtd:A': 'whole', 'vtd:B': 'whole'}).addBlocks).toEqual(
      new Map()
    );
  });

  test('only issues the user has not seen are new; resolved ones are not', () => {
    const current = {
      ...noIssues,
      parentAssignments: ['vtd:A', 'vtd:C'],
      missingBlocks: new Map([['vtd:A', ['a2', 'a3']]]),
      unmatched: ['ghost', 'ghost2'],
    };
    expect(findNewIssueIds(current, repairIssues)).toEqual(['vtd:C', 'ghost2', 'vtd:A']);
    expect(findNewIssueIds({...noIssues, parentAssignments: ['vtd:A']}, repairIssues)).toEqual([]);
  });
});

describe('repairAssignments', () => {
  test('districts: blocks drops the whole assignment and fills missing blocks; whole un-breaks', async () => {
    const save = mock(async () => ({ok: true}));
    useAssignmentsStore.setState({...districtState(), handlePutAssignments: save} as any);
    demographyService.unmatchedPaths = ['ghost'];
    useAssignmentRepairStore.setState({issues: repairIssues, choices});
    await repairAssignments();
    const s = useAssignmentsStore.getState();
    // a2 takes vtd:A's zone, read before vtd:A's own assignment is dropped.
    expect(Object.fromEntries(s.zoneAssignments)).toEqual({a1: 2, a2: 1, 'vtd:B': 3});
    expect([...s.shatterIds.parents]).toEqual(['vtd:A']);
    expect([...s.shatterIds.children].sort()).toEqual(['a1', 'a2']);
    expect(s.childToParent.get('a2')).toBe('vtd:A');
    expect(s.parentToChild.has('vtd:B')).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(useAssignmentRepairStore.getState().open).toBe(false);
  });

  test('communities: missing blocks join the whole unit’s communities; whole drops blocks', async () => {
    useMapControlsStore.setState({mapMode: 'coi'} as any);
    const save = mock(async () => ({ok: true}));
    useCoiAssignmentsStore.setState({
      ...districtState(),
      communityAssignments: new Map([
        [1, new Set(['vtd:A', 'a1'])],
        [2, new Set(['vtd:B', 'b1'])],
      ]),
      handlePutAssignments: save,
    } as any);
    useAssignmentRepairStore.setState({issues: {...repairIssues, unmatched: []}, choices});
    await repairAssignments();
    const s = useCoiAssignmentsStore.getState();
    expect([...s.communityAssignments.get(1)!].sort()).toEqual(['a1', 'a2']);
    expect([...s.communityAssignments.get(2)!]).toEqual(['vtd:B']);
    expect(save).toHaveBeenCalledTimes(1);
  });

  test('a unit the user never saw is re-raised, and nothing is applied', async () => {
    const save = mock(async () => ({ok: true}));
    const st = districtState();
    // vtd:C was broken up and saved whole after the user opened the modal.
    st.zoneAssignments.set('vtd:C', 4).set('c1', 4);
    st.shatterIds.parents.add('vtd:C');
    st.shatterIds.children.add('c1');
    st.parentToChild.set('vtd:C', new Set(['c1']));
    st.childToParent.set('c1', 'vtd:C');
    useAssignmentsStore.setState({...st, handlePutAssignments: save} as any);
    demographyService.unmatchedPaths = ['ghost'];
    useAssignmentRepairStore.setState({issues: repairIssues, choices});
    await repairAssignments();
    expect(useAssignmentsStore.getState().zoneAssignments.get('vtd:A')).toBe(1);
    expect(save).not.toHaveBeenCalled();
    const r = useAssignmentRepairStore.getState();
    expect(r.open).toBe(true);
    expect(r.newIds).toEqual(['vtd:C']);
    expect(r.issues?.parentAssignments).toEqual(['vtd:A', 'vtd:B', 'vtd:C']);
    // Earlier picks stay; the new unit's block has a zone, so it suggests blocks.
    expect(r.choices).toEqual({...choices, 'vtd:C': 'blocks'});
  });

  test('issues from another document are ignored', async () => {
    const save = mock(async () => ({ok: true}));
    useAssignmentsStore.setState({...districtState(), handlePutAssignments: save} as any);
    useAssignmentRepairStore.setState({issues: {...repairIssues, documentId: 'other'}, choices});
    await repairAssignments();
    expect(useAssignmentsStore.getState().zoneAssignments.has('vtd:A')).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  test('the store re-checks issues against its own state, so a repeat is a no-op', () => {
    useAssignmentsStore.setState(districtState() as any);
    demographyService.unmatchedPaths = ['ghost'];
    expect(useAssignmentsStore.getState().applyAssignmentRepair(repairIssues, choices)).toEqual({
      applied: true,
    });
    const once = Object.fromEntries(useAssignmentsStore.getState().zoneAssignments);
    expect(useAssignmentsStore.getState().applyAssignmentRepair(repairIssues, choices)).toEqual({
      applied: true,
    });
    expect(Object.fromEntries(useAssignmentsStore.getState().zoneAssignments)).toEqual(once);
  });
});

describe('checkAssignments', () => {
  test('a null-zone whole-unit assignment still blocks the save and opens the modal', async () => {
    const st = districtState();
    st.zoneAssignments = new Map([
      ['vtd:A', null],
      ['a1', 2],
    ]);
    st.shatterIds = {parents: new Set(['vtd:A']), children: new Set(['a1'])};
    useAssignmentsStore.setState(st as any);
    edgesMock.mockImplementation(async () => [{parent_path: 'vtd:A', child_path: 'a1'}]);
    expect(await checkAssignments('save')).toBe(false);
    const r = useAssignmentRepairStore.getState();
    expect(r.issues?.parentAssignments).toEqual(['vtd:A']);
    expect(r.choices).toEqual({'vtd:A': 'blocks'});
    expect(r.open).toBe(true);
    // Guards the mock wiring: the check really went through the mocked edges call.
    expect(edgesMock).toHaveBeenCalledTimes(1);
    expect(r.issues?.unverified).toEqual([]);
  });

  test('a clean map passes without fetching edges', async () => {
    const st = districtState();
    st.zoneAssignments = new Map([['a1', 2]]);
    useAssignmentsStore.setState(st as any);
    expect(await checkAssignments('save')).toBe(true);
    expect(edgesMock).not.toHaveBeenCalled();
  });

  test('a broken-up unit missing from demography is not counted as unmatched', async () => {
    const st = districtState();
    st.zoneAssignments = new Map([['a1', 2]]);
    useAssignmentsStore.setState(st as any);
    demographyService.unmatchedPaths = ['vtd:A'];
    expect(await checkAssignments('save')).toBe(true);
  });

  test('once dismissed, background checks stay quiet; an explicit save reopens', async () => {
    useAssignmentsStore.setState(districtState() as any);
    expect(await checkAssignments('load')).toBe(false);
    useAssignmentRepairStore.setState({open: false, dismissedFor: 'd1'});
    edgesMock.mockClear();
    expect(await checkAssignments('autosave')).toBe(false);
    expect(useAssignmentRepairStore.getState().open).toBe(false);
    expect(edgesMock).not.toHaveBeenCalled();
    expect(await checkAssignments('save')).toBe(false);
    expect(useAssignmentRepairStore.getState().open).toBe(true);
  });

  test('an edge fetch failure leaves every unit unverified', async () => {
    useAssignmentsStore.setState(districtState() as any);
    edgesMock.mockImplementation(async () => {
      throw new Error('net');
    });
    spyOn(console, 'error').mockImplementation(() => {});
    expect(await checkAssignments('save')).toBe(false);
    expect(useAssignmentRepairStore.getState().issues?.unverified).toEqual(['vtd:A', 'vtd:B']);
  });

  test('view access never blocks', async () => {
    useMapStore.setState({mapDocument: {...doc, access: 'read'}});
    useAssignmentsStore.setState(districtState() as any);
    expect(await checkAssignments('save')).toBe(true);
  });

  test.each(['districts', 'coi'] as const)(
    '%s: a save is blocked before it reaches IDB',
    async mode => {
      spyOn(idb, 'flushPendingUpdate').mockImplementation(async () => {});
      const getDocument = spyOn(idb, 'getDocument').mockImplementation(
        async () => undefined as any
      );
      useMapControlsStore.setState({mapMode: mode} as any);
      useAssignmentsStore.setState(districtState() as any);
      useCoiAssignmentsStore.setState({
        ...districtState(),
        communityAssignments: new Map([[1, new Set(['vtd:A', 'a1'])]]),
      } as any);
      const store = mode === 'coi' ? useCoiAssignmentsStore : useAssignmentsStore;
      const result = await store.getState().handlePutAssignments();
      expect(result.ok).toBe(false);
      expect(getDocument).not.toHaveBeenCalled();
    }
  );
});
