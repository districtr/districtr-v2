import {beforeEach, describe, expect, mock, spyOn, test} from 'bun:test';
import {
  buildRepairPlan,
  checkAssignments,
  findMissingBlocks,
  findParentRows,
  hasIssues,
  repairAssignments,
  suggestParentRowChoice,
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
const noIssues = {documentId: 'd1', parentRows: [], missingBlocks: new Map(), unmatched: []};

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
const repairIssues = {
  documentId: 'd1',
  parentRows: ['vtd:A', 'vtd:B'],
  missingBlocks: new Map([['vtd:A', ['a2']]]),
  unmatched: ['ghost'],
  unverified: [],
};

beforeEach(() => {
  edgesMock.mockReset();
  edgesMock.mockImplementation(async () => []);
  useMapStore.setState({mapDocument: doc});
  useAssignmentsStore.setState({handlePutAssignments: realDistrictSave});
  useCoiAssignmentsStore.setState({handlePutAssignments: realCoiSave});
  useMapControlsStore.setState({mapMode: 'districts'} as any);
  useAssignmentRepairStore.setState({issues: null, open: false, dismissedFor: null, choices: {}});
  demographyService.unmatchedPaths = [];
  spyOn(idb, 'updateIdbAssignments').mockImplementation(() => {});
  spyOn(idb, 'updateIdbCoiAssignments').mockImplementation(() => {});
  spyOn(demographyService, 'updatePopulations').mockImplementation(() => true);
});

describe('pure checks', () => {
  test('flags broken-up units that still have their own row', () => {
    const assigned = new Set(['vtd:A', 'a1', 'vtd:C']);
    expect(findParentRows(new Set(['vtd:A', 'vtd:B']), id => assigned.has(id))).toEqual(['vtd:A']);
  });

  test('reports blocks missing per unit, and units with no edges as unverified', () => {
    const edges = [
      {parent_path: 'vtd:A', child_path: 'a1'},
      {parent_path: 'vtd:A', child_path: 'a2'},
      {parent_path: 'vtd:B', child_path: 'b1'},
    ];
    const {missingBlocks, unverified} = findMissingBlocks(
      ['vtd:A', 'vtd:B', 'vtd:C'],
      edges,
      new Set(['a1', 'b1'])
    );
    expect([...missingBlocks]).toEqual([['vtd:A', ['a2']]]);
    expect(unverified).toEqual(['vtd:C']);
  });

  test('suggests keeping blocks only when some block carries an assignment', () => {
    const assigned = new Set(['a2']);
    const isAssigned = (id: string) => assigned.has(id);
    expect(suggestParentRowChoice(['a1', 'a2'], isAssigned)).toBe('blocks');
    expect(suggestParentRowChoice(['b1', 'b2'], isAssigned)).toBe('whole');
  });

  test('hasIssues counts each kind of finding', () => {
    expect(hasIssues({...noIssues, unverified: ['vtd:A']})).toBe(false);
    expect(hasIssues({...noIssues, unverified: [], parentRows: ['vtd:A']})).toBe(true);
    expect(hasIssues({...noIssues, unverified: [], unmatched: ['x']})).toBe(true);
    expect(hasIssues({...noIssues, unverified: [], missingBlocks: new Map([['p', ['b']]])})).toBe(
      true
    );
  });

  test('a plan built against already-repaired state changes nothing', () => {
    const plan = buildRepairPlan(
      repairIssues,
      {'vtd:A': 'blocks', 'vtd:B': 'whole'},
      {isBroken: id => id === 'vtd:A', hasRow: () => false, isChild: () => true}
    );
    expect(plan).toEqual({keepWhole: [], dropRows: [], addBlocks: new Map()});
  });
});

describe('repairAssignments', () => {
  test('districts: blocks drops the whole row and fills missing blocks; whole un-breaks', async () => {
    const save = mock(async () => ({ok: true}));
    useAssignmentsStore.setState({...districtState(), handlePutAssignments: save} as any);
    useAssignmentRepairStore.setState({
      issues: repairIssues,
      choices: {'vtd:A': 'blocks', 'vtd:B': 'whole'},
    });
    await repairAssignments();
    const s = useAssignmentsStore.getState();
    // a2 takes vtd:A's zone, read before vtd:A's own row is dropped.
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
      communityAssignments: new Map([
        [1, new Set(['vtd:A', 'a1'])],
        [2, new Set(['vtd:B', 'b1'])],
      ]),
      ...districtState(),
      handlePutAssignments: save,
    } as any);
    useAssignmentRepairStore.setState({
      issues: {...repairIssues, unmatched: []},
      choices: {'vtd:A': 'blocks', 'vtd:B': 'whole'},
    });
    await repairAssignments();
    const s = useCoiAssignmentsStore.getState();
    expect([...s.communityAssignments.get(1)!].sort()).toEqual(['a1', 'a2']);
    expect([...s.communityAssignments.get(2)!]).toEqual(['vtd:B']);
    expect(save).toHaveBeenCalledTimes(1);
  });

  test('issues from another document are ignored', async () => {
    const save = mock(async () => ({ok: true}));
    useAssignmentsStore.setState({...districtState(), handlePutAssignments: save} as any);
    useAssignmentRepairStore.setState({
      issues: {...repairIssues, documentId: 'other'},
      choices: {'vtd:A': 'blocks', 'vtd:B': 'whole'},
    });
    await repairAssignments();
    expect(useAssignmentsStore.getState().zoneAssignments.has('vtd:A')).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('checkAssignments', () => {
  test('a null-zone whole-unit row still blocks the save and opens the modal', async () => {
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
    expect(r.issues?.parentRows).toEqual(['vtd:A']);
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
