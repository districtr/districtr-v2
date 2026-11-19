import {afterEach, beforeEach, describe, expect, jest, mock, test} from 'bun:test';
import * as apiConstants from '@utils/api/constants';

// The split is a build-time setting. mock.module updates already-imported bindings in
// place and lasts for the whole test process; no other test reads these two constants.
const WORKER = 'https://tiles.test';
mock.module('@utils/api/constants', () => ({
  ...apiConstants,
  TILES_WORKER_URL: WORKER,
  TILES_SPLIT: true,
}));
const edgesMock = mock(async () => [{parent_path: 'vtd:A', child_path: 'a1'}]);
mock.module('../api/apiHandlers/getChildEdges', () => ({getChildEdges: edgesMock}));

const {blocksTilesUrl, isBlocksTilesUrl, parentTilesPath, splitsTiles} = await import(
  '@constants/map/sources'
);
const {
  blockTilesReady,
  followBlockTiles,
  requestBlockTiles,
  setBlockTilesInView,
  useBlockTilesStore,
} = await import('./blockTiles');
const {useMapStore} = await import('@/app/store/mapStore');
const {useAssignmentsStore} = await import('@/app/store/assignmentsStore');

const PATH = 'tilesets/mt_districtr_view_v2.pmtiles';
const COMBINED = `${WORKER}/${PATH}`;
const PARENT = `${WORKER}/tilesets/mt_districtr_view_v2.parent.pmtiles`;
const doc = {document_id: 'd1', tiles_s3_path: PATH, child_layer: 'mt_blocks'};

/** Whether the promise has settled once pending microtasks have run. */
const settled = async (promise: Promise<unknown>) => {
  let done = false;
  promise.then(() => (done = true));
  await Promise.resolve();
  await Promise.resolve();
  return done;
};

beforeEach(() => {
  setBlockTilesInView(undefined);
  useBlockTilesStore.setState({combinedFor: undefined});
});

describe('tile source urls', () => {
  test('the parent-only archive sits beside the combined one', () => {
    expect(parentTilesPath(PATH)).toBe('tilesets/mt_districtr_view_v2.parent.pmtiles');
    expect(blocksTilesUrl(PATH)).toBe(COMBINED);
    expect(blocksTilesUrl(PATH, true)).toBe(PARENT);
  });

  test("both archives count as the map's block source", () => {
    expect(isBlocksTilesUrl(COMBINED, PATH)).toBe(true);
    expect(isBlocksTilesUrl(PARENT, PATH)).toBe(true);
    expect(isBlocksTilesUrl(`${WORKER}/tilesets/co_districtr_view_v2.pmtiles`, PATH)).toBe(false);
    expect(isBlocksTilesUrl(undefined, PATH)).toBe(false);
  });

  test('only a map with a child layer splits', () => {
    expect(splitsTiles({child_layer: 'mt_blocks'})).toBe(true);
    expect(splitsTiles({child_layer: null})).toBe(false);
  });
});

describe('waiting for block tiles', () => {
  test('a map with no child layer never waits and never moves its source', async () => {
    const whole = {...doc, child_layer: null};
    requestBlockTiles(whole);
    expect(useBlockTilesStore.getState().combinedFor).toBeUndefined();
    expect(await settled(blockTilesReady(whole))).toBe(true);
  });

  test('a request moves the document to the combined archive', () => {
    requestBlockTiles(doc);
    expect(useBlockTilesStore.getState().combinedFor).toBe('d1');
  });

  test('the wait ends when the combined archive comes into view', async () => {
    const ready = blockTilesReady(doc);
    expect(await settled(ready)).toBe(false);
    setBlockTilesInView(PARENT);
    expect(await settled(ready)).toBe(false);
    setBlockTilesInView(COMBINED);
    expect(await settled(ready)).toBe(true);
  });

  test('another document on a tileset already in view is ready at once', async () => {
    setBlockTilesInView(COMBINED);
    requestBlockTiles({...doc, document_id: 'd2'});
    expect(await settled(blockTilesReady({...doc, document_id: 'd2'}))).toBe(true);
  });

  test('a source that unmounts mid-switch and mounts again ends the wait', async () => {
    requestBlockTiles(doc);
    const ready = blockTilesReady(doc);
    setBlockTilesInView(undefined); // the unmount
    expect(await settled(ready)).toBe(false);
    setBlockTilesInView(COMBINED); // the source mounts on the combined archive
    expect(await settled(ready)).toBe(true);
  });

  test('a source that left the combined archive is waited for again', async () => {
    setBlockTilesInView(COMBINED);
    setBlockTilesInView(undefined);
    expect(await settled(blockTilesReady(doc))).toBe(false);
  });
});

type Listener = (event?: Record<string, unknown>) => void;

/** The parts of a MapLibre map that followBlockTiles uses. */
const fakeMap = () => {
  const listeners: Record<string, Listener[]> = {};
  const source = {
    url: COMBINED,
    tiles: undefined as string[] | undefined,
    setUrl: mock((_url: string) => {}),
  };
  const map = {
    loaded: false,
    source,
    refreshTiles: mock((_id: string) => {}),
    on: (type: string, fn: Listener) => void (listeners[type] ??= []).push(fn),
    off: (type: string, fn: Listener) =>
      void (listeners[type] = (listeners[type] ?? []).filter(l => l !== fn)),
    emit: (type: string, event?: Record<string, unknown>) =>
      [...(listeners[type] ?? [])].forEach(fn => fn(event)),
    listening: () => Object.values(listeners).flat().length,
    getSource: () => source,
    isSourceLoaded: () => map.loaded,
    /** The combined TileJSON arrives, with every tile in view loaded or not. */
    tileJsonArrives: (loaded: boolean) => {
      source.tiles = [`${COMBINED}/{z}/{x}/{y}.mvt`];
      map.loaded = loaded;
      map.emit('sourcedata', {sourceId: 'blocks', sourceDataType: 'metadata'});
    },
    /** MapLibre's reload of the tiles in view finishes. */
    reloadFinishes: () => {
      map.loaded = true;
      map.emit('sourcedata', {sourceId: 'blocks', sourceDataType: 'content'});
    },
  };
  return map;
};

describe('following the block source to a new archive', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('tiles all loaded when the TileJSON arrives need no refresh', () => {
    const map = fakeMap();
    const inView = mock(() => {});
    followBlockTiles(map as any, COMBINED, inView);
    map.emit('idle');
    expect(inView).not.toHaveBeenCalled(); // the previous archive's tiles are still in view

    map.tileJsonArrives(true);
    expect(inView).not.toHaveBeenCalled(); // MapLibre's own reload comes next
    map.loaded = false;
    map.emit('sourcedata', {sourceId: 'blocks', sourceDataType: 'content'});
    expect(inView).not.toHaveBeenCalled();
    map.reloadFinishes();

    expect(inView).toHaveBeenCalledTimes(1);
    expect(map.refreshTiles).not.toHaveBeenCalled();
    expect(map.listening()).toBe(0);
  });

  test('tiles still loading when the TileJSON arrives are fetched again, once', () => {
    const map = fakeMap();
    const inView = mock(() => {});
    followBlockTiles(map as any, COMBINED, inView);

    map.tileJsonArrives(false);
    map.reloadFinishes();
    expect(map.refreshTiles).toHaveBeenCalledTimes(1);
    expect(inView).not.toHaveBeenCalled();

    map.loaded = false;
    map.emit('sourcedata', {sourceId: 'blocks', sourceDataType: 'content'});
    expect(inView).not.toHaveBeenCalled();
    map.reloadFinishes();
    expect(inView).toHaveBeenCalledTimes(1);
    expect(map.refreshTiles).toHaveBeenCalledTimes(1);
  });

  test('a tile that fails last still ends the follow', () => {
    const map = fakeMap();
    const inView = mock(() => {});
    followBlockTiles(map as any, COMBINED, inView);
    map.tileJsonArrives(true);
    map.loaded = false;
    map.emit('sourcedata', {sourceId: 'blocks', sourceDataType: 'content'});

    // MapLibre fires `error` alone for a failed tile, and reports the source as loaded.
    map.loaded = true;
    map.emit('error', {sourceId: 'blocks', tile: {}});
    expect(inView).toHaveBeenCalledTimes(1);
  });

  test('a failed tile of another source is ignored', () => {
    const map = fakeMap();
    const inView = mock(() => {});
    followBlockTiles(map as any, COMBINED, inView);
    map.tileJsonArrives(true);
    map.loaded = true;
    map.emit('error', {sourceId: 'counties', tile: {}});
    expect(inView).not.toHaveBeenCalled();
  });

  test('a failed TileJSON is requested again; a failed tile is not', () => {
    const map = fakeMap();
    followBlockTiles(map as any, COMBINED, () => {});

    map.emit('error', {sourceId: 'blocks', tile: {}});
    jest.advanceTimersByTime(60_000);
    expect(map.source.setUrl).not.toHaveBeenCalled();

    map.emit('error', {sourceId: 'blocks'});
    jest.advanceTimersByTime(999);
    expect(map.source.setUrl).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(map.source.setUrl).toHaveBeenCalledWith(COMBINED);
  });

  test('stopping cancels a pending retry and every listener', () => {
    const map = fakeMap();
    const inView = mock(() => {});
    const stop = followBlockTiles(map as any, COMBINED, inView);
    map.emit('error', {sourceId: 'blocks'});
    stop();
    jest.advanceTimersByTime(60_000);
    map.tileJsonArrives(true);
    map.reloadFinishes();
    expect(map.source.setUrl).not.toHaveBeenCalled();
    expect(inView).not.toHaveBeenCalled();
    expect(map.listening()).toBe(0);
  });
});

describe('a shatter whose plan is left during its wait', () => {
  const start = () => {
    useMapStore.setState({
      mapDocument: {...doc, districtr_map_slug: 'mt_test'} as any,
      mapLock: null,
      notification: null,
    } as any);
    return useMapStore.getState().handleShatter([{id: 'vtd:A'}] as any);
  };
  // Loading a plan resets the lock; a lock present afterwards belongs to that plan.
  const openAnotherPlan = () =>
    useMapStore.setState({
      mapDocument: {...doc, document_id: 'd2', districtr_map_slug: 'mt_test'} as any,
      mapLock: {isLocked: true, reason: 'Saving map'},
    } as any);

  test('a timeout leaves the open plan alone', async () => {
    jest.useFakeTimers();
    const shatter = start();
    await Promise.resolve();
    openAnotherPlan();
    jest.advanceTimersByTime(20_000);
    await shatter;
    jest.useRealTimers();
    expect(useMapStore.getState().notification).toBeNull();
    expect(useMapStore.getState().mapLock).toEqual({isLocked: true, reason: 'Saving map'});
  });

  test('arriving tiles do not shatter the open plan', async () => {
    let sendEdges = () => {};
    edgesMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          sendEdges = () => resolve([{parent_path: 'vtd:A', child_path: 'a1'}]);
        })
    );
    setBlockTilesInView(COMBINED);
    const shatter = start();
    openAnotherPlan();
    const before = useAssignmentsStore.getState().shatterIds;
    sendEdges();
    await shatter;
    expect(useAssignmentsStore.getState().shatterIds).toBe(before);
    expect(useMapStore.getState().mapLock).toEqual({isLocked: true, reason: 'Saving map'});
  });
});

describe('a shatter whose block tiles never arrive', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('unlocks the map after 20 seconds and says the blocks are still loading', async () => {
    useMapStore.setState({
      mapDocument: {...doc, districtr_map_slug: 'mt_test'} as any,
      mapLock: null,
      notification: null,
    } as any);
    const shatter = useMapStore.getState().handleShatter([{id: 'vtd:A'}] as any);
    await Promise.resolve();
    expect(useMapStore.getState().mapLock).toEqual({isLocked: true, reason: 'Breaking districts'});
    expect(useBlockTilesStore.getState().combinedFor).toBe('d1');

    jest.advanceTimersByTime(19_999);
    await Promise.resolve();
    expect(useMapStore.getState().mapLock).not.toBeNull();

    jest.advanceTimersByTime(1);
    await shatter;
    const {mapLock, notification} = useMapStore.getState();
    expect(mapLock).toBeNull();
    expect(notification?.id).toStartWith('break-patchShatter-no-block-tiles-mt_test-d1');
    expect(notification?.message).toContain('still loading');
  });
});
