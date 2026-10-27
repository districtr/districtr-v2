import {beforeEach, describe, expect, spyOn, test} from 'bun:test';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {idb} from '@/app/utils/idb/idb';
import type {NullableZone} from '@constants/map/zone';

// Plan A's edit view, its read-only View/Evaluate view (same public_id), and plan B.
const docA = {document_id: 'a', public_id: 1, access: 'edit', updated_at: '1'} as any;
const docAView = {document_id: 'anonymous', public_id: 1, access: 'read', updated_at: '1'} as any;
const docB = {document_id: 'b', public_id: 2, access: 'edit', updated_at: '1'} as any;

const locks = () => useMapControlsStore.getState().mapOptions.lockPaintedAreas;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
// Saved locks per document_id, as getZoneLocks would read them from IDB.
let saved: Record<string, NullableZone[]>;
let setZoneLocks: ReturnType<typeof spyOn>;

beforeEach(() => {
  saved = {};
  useMapStore.setState({mapDocument: null});
  useMapControlsStore.setState(state => ({
    mapOptions: {...state.mapOptions, lockPaintedAreas: []},
  }));
  spyOn(idb, 'getZoneLocks').mockImplementation(async id => saved[id] ?? []);
  setZoneLocks = spyOn(idb, 'setZoneLocks').mockImplementation(async () => {});
  setZoneLocks.mockClear();
  spyOn(idb, 'updateIdbDocumentMetadata').mockImplementation(async () => {});
});

describe('district locks', () => {
  test('carry over when switching views of the same plan', async () => {
    useMapStore.getState().setMapDocument(docA);
    await flush();
    useMapControlsStore.getState().setLockedZones([2, 5]);
    expect(setZoneLocks).toHaveBeenCalledWith('a', [2, 5]);

    useMapStore.getState().setMapDocument(docAView);
    await flush();
    expect(locks()).toEqual([2, 5]);

    useMapStore.getState().setMapDocument(docA);
    await flush();
    expect(locks()).toEqual([2, 5]);
  });

  test('a different map starts unlocked', async () => {
    useMapStore.getState().setMapDocument(docA);
    await flush();
    useMapControlsStore.getState().setLockedZones([2]);

    useMapStore.getState().setMapDocument(docB);
    expect(locks()).toEqual([]);
    await flush();
    expect(locks()).toEqual([]);
  });

  test('a reload restores the saved locks without re-saving them', async () => {
    saved.a = [3, 4];
    useMapStore.getState().setMapDocument(docA);
    expect(locks()).toEqual([]);
    await flush();
    expect(locks()).toEqual([3, 4]);
    expect(setZoneLocks).not.toHaveBeenCalled();
  });

  test('a late restore never overrides newer locks or lands on another map', async () => {
    saved.a = [3, 4];
    useMapStore.getState().setMapDocument(docA);
    useMapControlsStore.getState().setLockedZones([1]);
    await flush();
    expect(locks()).toEqual([1]);

    useMapStore.setState({mapDocument: null});
    useMapControlsStore.getState().setLockedZones([]);
    useMapStore.getState().setMapDocument(docA);
    useMapStore.getState().setMapDocument(docB);
    await flush();
    expect(locks()).toEqual([]);
  });
});
