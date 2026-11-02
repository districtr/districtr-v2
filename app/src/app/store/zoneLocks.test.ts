import {afterEach, beforeEach, describe, expect, mock, spyOn, test} from 'bun:test';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {idb} from '@/app/utils/idb/idb';
import {filterFeatures} from '@/app/utils/map/filterFeatures';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import type {NullableZone} from '@constants/map/zone';

// Plan A's edit view, its read-only View/Evaluate view (same public_id), and plan B.
const docA = {document_id: 'a', public_id: 1, access: 'edit', updated_at: '1'} as any;
const docAView = {document_id: 'anonymous', public_id: 1, access: 'read', updated_at: '1'} as any;
const docB = {document_id: 'b', public_id: 2, access: 'edit', updated_at: '1'} as any;

const locks = () => useMapControlsStore.getState().mapOptions.lockPaintedAreas;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
// Whether a brush stroke in `zone` over an unassigned unit would paint it.
const brushPaints = (zone: number) => {
  useMapControlsStore.setState({activeTool: ACTIVE_TOOLS.BRUSH, selectedZone: zone});
  return filterFeatures({_features: [{id: 'u1'} as any]}).length > 0;
};
// Saved locks per document_id, as getZoneLocks would read them from IDB.
let saved: Record<string, NullableZone[]>;
let setZoneLocks: ReturnType<typeof spyOn>;

beforeEach(() => {
  saved = {};
  // Locks apply only in Super Draw; the plain-Draw tests switch this off.
  useToolbarStore.setState({superDraw: true});
  useMapStore.setState({mapDocument: null});
  useMapControlsStore.setState(state => ({
    mapOptions: {...state.mapOptions, lockPaintedAreas: []},
  }));
  spyOn(idb, 'getZoneLocks').mockImplementation(async id => saved[id] ?? []);
  setZoneLocks = spyOn(idb, 'setZoneLocks').mockImplementation(async (id, zones) => {
    saved[id] = zones;
  });
  setZoneLocks.mockClear();
  spyOn(idb, 'updateIdbDocumentMetadata').mockImplementation(async () => {});
  spyOn(idb, 'getDocument').mockImplementation(async () => undefined);
});

// Spies outlive a test file in bun; restore them so other files see fresh call counts.
afterEach(() => {
  mock.restore();
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

  test('a reload with the selected district locked selects the first unlocked one', async () => {
    saved.a = [1, 2];
    useMapStore.getState().setMapDocument({...docA, num_districts: 4});
    expect(useMapControlsStore.getState().selectedZone).toBe(1);
    await flush();
    expect(useMapControlsStore.getState().selectedZone).toBe(3);
  });

  test('lowering the district count drops locks on the removed districts', async () => {
    useMapStore.getState().setMapDocument({...docA, num_districts: 5});
    await flush();
    useMapControlsStore.getState().setLockedZones([2, 5]);

    useMapStore.getState().setNumDistricts(3);
    expect(locks()).toEqual([2]);
    expect(saved.a).toEqual([2]);
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

  test('plain Draw ignores the locks and Super Draw applies them again', async () => {
    useMapStore.getState().setMapDocument(docA);
    await flush();
    useMapControlsStore.getState().setLockedZones([2]);
    expect(brushPaints(2)).toBe(false);

    useToolbarStore.getState().setSuperDraw(false);
    expect(brushPaints(2)).toBe(true);
    expect(saved.a).toEqual([2]);

    useToolbarStore.getState().setSuperDraw(true);
    expect(brushPaints(2)).toBe(false);
  });

  test('back in Super Draw, a locked selected district gives way to an unlocked one', async () => {
    useMapStore.getState().setMapDocument({...docA, num_districts: 4});
    await flush();
    useMapControlsStore.getState().setLockedZones([2]);
    useToolbarStore.getState().setSuperDraw(false);
    useMapControlsStore.getState().setSelectedZone(2);

    useToolbarStore.getState().setSuperDraw(true);
    expect(useMapControlsStore.getState().selectedZone).toBe(1);
  });

  test('opening a plan in plain Draw keeps its saved locks for Super Draw', async () => {
    useToolbarStore.setState({superDraw: false});
    saved.a = [3];
    useMapStore.getState().setMapDocument(docB);
    await flush();
    useMapStore.getState().setMapDocument(docA);
    await flush();
    expect(saved.a).toEqual([3]);
    expect(setZoneLocks).not.toHaveBeenCalled();
    expect(brushPaints(3)).toBe(true);

    useToolbarStore.getState().setSuperDraw(true);
    expect(brushPaints(3)).toBe(false);
  });
});
