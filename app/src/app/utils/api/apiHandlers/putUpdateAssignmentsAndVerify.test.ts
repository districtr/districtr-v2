import {beforeEach, describe, expect, mock, spyOn, test} from 'bun:test';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useMapStore} from '@/app/store/mapStore';
import {idb} from '../../idb/idb';

// mock.module updates already-imported bindings in place, so the handler's API
// imports point at these mocks.
const putMock = mock(async (_body: any): Promise<any> => ({ok: true, response: {updated_at: 'U'}}));
mock.module('./putUpdateDocument', () => ({putUpdateDocument: putMock}));
mock.module('./getAssignments', () => ({
  getAssignments: async () => ({ok: true, response: [{geo_id: 'a', zone: 1}]}),
}));
mock.module('./getDocument', () => ({
  getDocument: async () => ({ok: true, response: {document_comments: []}}),
}));

const {putUpdateAssignmentsAndVerify} = await import('./putUpdateAssignmentsAndVerify');

const doc = {
  document_id: 'doc1',
  updated_at: 'T0',
  color_scheme: ['#111'],
  map_metadata: {},
  document_comments: [],
} as any;
const save = () =>
  putUpdateAssignmentsAndVerify({
    mapDocument: doc,
    zoneAssignments: new Map([['a', 1]]),
    shatterIds: {parents: new Set(), children: new Set()},
    childToParent: new Map(),
  });

let updateDocument: ReturnType<typeof spyOn>;
let updateIdbAssignments: ReturnType<typeof spyOn>;
beforeEach(() => {
  putMock.mockReset();
  putMock.mockImplementation(async () => ({ok: true, response: {updated_at: 'U'}}));
  updateDocument = spyOn(idb, 'updateDocument').mockImplementation(async () => {});
  updateIdbAssignments = spyOn(idb, 'updateIdbAssignments').mockImplementation(() => {});
  updateDocument.mockClear();
  updateIdbAssignments.mockClear();
  useMapStore.setState({mapDocument: doc, updated: {metadata: true, comments: false}});
  useAssignmentsStore.setState({clientLastUpdated: 'T1'});
});

describe('putUpdateAssignmentsAndVerify', () => {
  test('a clean save adopts the server timestamp and marks the map clean', async () => {
    const result = await save();
    expect(result).toEqual({ok: true, response: {updated_at: 'U'}});
    expect(useAssignmentsStore.getState().clientLastUpdated).toBe('U');
    expect(useMapStore.getState().updated.metadata).toBe(false);
    expect(updateDocument).toHaveBeenCalledTimes(1);
  });

  test('sends {} when no aliases are loaded, so the server clears stale ones', async () => {
    await save();
    expect(putMock.mock.calls[0][0].metadata.zone_aliases).toEqual({});
  });

  test('an edit during the save keeps the map dirty and re-stamps IDB', async () => {
    putMock.mockImplementation(async () => {
      useAssignmentsStore.setState({clientLastUpdated: 'T2'});
      return {ok: true, response: {updated_at: 'U'}};
    });
    const result = await save();
    expect(result.ok && result.response.superseded).toBe(true);
    expect(useMapStore.getState().mapDocument?.updated_at).toBe('U');
    expect(useAssignmentsStore.getState().clientLastUpdated).toBe('T2');
    expect(useMapStore.getState().updated.metadata).toBe(true);
    expect(updateDocument).not.toHaveBeenCalled();
    expect(updateIdbAssignments).toHaveBeenCalledTimes(1);
  });

  test('leaving the map mid-save still records the save in its IDB copy only', async () => {
    const other = {...doc, document_id: 'doc2', updated_at: 'X'};
    putMock.mockImplementation(async () => {
      useMapStore.setState({mapDocument: other});
      useAssignmentsStore.setState({clientLastUpdated: ''});
      return {ok: true, response: {updated_at: 'U'}};
    });
    const result = await save();
    expect(result.ok && result.response.superseded).toBeFalsy();
    expect(updateDocument).toHaveBeenCalledTimes(1);
    expect((updateDocument.mock.calls[0][0] as any).id).toBe('doc1');
    expect((updateDocument.mock.calls[0][0] as any).clientLastUpdated).toBe('U');
    // The map now open keeps its own timestamps.
    expect(useMapStore.getState().mapDocument?.updated_at).toBe('X');
    expect(useAssignmentsStore.getState().clientLastUpdated).toBe('');
  });
});
