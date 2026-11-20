/**
 * A Fork copies the server's version, then saves the local edits onto the copy.
 * Run with `bun test`.
 */
import {afterEach, expect, mock, spyOn, test} from 'bun:test';
import * as createMapDocumentModule from '../utils/api/apiHandlers/createMapDocument';
import * as putModule from '../utils/api/apiHandlers/putUpdateAssignmentsAndVerify';
import {SyncConflictResolution} from '@constants/document/sync';
import {useAssignmentsStore} from './assignmentsStore';
import {useMapStore} from './mapStore';
import {idb} from '../utils/idb/idb';

afterEach(() => mock.restore());

test.each([
  ['raised', 9, {'9': 'North'}],
  ['lowered', 7, {'2': '8'}],
])('a fork keeps the local district count when it was %s', async (_, localCount, aliases) => {
  const server = {
    document_id: 'd1',
    districtr_map_slug: 'm',
    num_districts: 8,
    num_districts_modifiable: true,
    map_metadata: {},
  } as any;
  spyOn(createMapDocumentModule, 'createMapDocument').mockImplementation((async () => ({
    ok: true,
    response: {...server, document_id: 'd2', public_id: 2, map_metadata: null},
  })) as any);
  const put = spyOn(putModule, 'putUpdateAssignmentsAndVerify').mockImplementation((async () => ({
    ok: true,
    response: {updated_at: 'T9'},
  })) as any);
  spyOn(idb, 'getDocument').mockImplementation((async () => ({
    assignments: [{document_id: 'd1', geo_id: 'a', zone: localCount}],
  })) as any);
  useAssignmentsStore.setState({ingestFromDocument: () => {}});
  useMapStore.setState({setNotification: () => {}});

  await useAssignmentsStore.getState().resolveConflict(
    SyncConflictResolution.Fork,
    {
      serverDocument: server,
      localDocument: {...server, num_districts: localCount, map_metadata: {zone_aliases: aliases}},
    } as any,
    {onNavigate: () => {}}
  );
  const {mapDocument} = put.mock.calls[0][0];
  expect(mapDocument.num_districts).toBe(localCount);
  expect(mapDocument.map_metadata.zone_aliases).toEqual(aliases);
});
