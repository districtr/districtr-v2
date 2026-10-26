import {afterEach, beforeEach, describe, expect, test} from 'bun:test';
import {useOverlayStore} from './overlayStore';
import {useMapStore} from './mapStore';
import {useMapControlsStore} from './mapControlsStore';

const feature = {id: '1714000', geometry: {type: 'Polygon', coordinates: []}};
const initialMapState = useMapStore.getState();

const setOverlayMap = (
  sourceLayer: string | null,
  querySourceFeatures: (source: string, opts?: {sourceLayer?: string}) => unknown[]
) =>
  useMapStore.setState({
    getMapRef: () => ({querySourceFeatures}),
    mapDocument: {overlays: [{overlay_id: 'overlay', source_layer: sourceLayer}]},
  } as any);

describe('setPaintConstraint', () => {
  // bun shares module state across test files; don't leak the fake map or mask.
  afterEach(() => {
    useMapStore.setState(initialMapState);
    useOverlayStore.getState().reset();
  });

  test('passes source_layer when querying a pmtiles overlay', () => {
    // Mimics MapLibre: vector sources return nothing without sourceLayer.
    setOverlayMap('places', (_source, opts) => (opts?.sourceLayer === 'places' ? [feature] : []));

    useOverlayStore.getState().setPaintConstraint('overlay', '1714000');

    expect(useOverlayStore.getState().paintConstraint?.features).toHaveLength(1);
  });

  test('queries a geojson overlay without sourceLayer', () => {
    let receivedOpts: unknown = 'not called';
    setOverlayMap(null, (_source, opts) => {
      receivedOpts = opts;
      return [feature];
    });

    useOverlayStore.getState().setPaintConstraint('overlay', '1714000');

    expect(receivedOpts).toBeUndefined();
    expect(useOverlayStore.getState().paintConstraint?.features).toHaveLength(1);
  });

  test('clears the mask when no feature matches', () => {
    setOverlayMap(null, () => [{...feature, id: 'other'}]);

    useOverlayStore.getState().setPaintConstraint('overlay', '1714000');

    expect(useOverlayStore.getState().paintConstraint).toBeNull();
  });
});

const mask = (overlayId: string) =>
  useOverlayStore.setState({paintConstraint: {overlayId, featureId: 'f', features: []}});
const state = () => useOverlayStore.getState();

const initialControlsState = useMapControlsStore.getState();

describe('mask layers', () => {
  afterEach(() => {
    useMapStore.setState(initialMapState);
    useMapControlsStore.setState(initialControlsState);
    useOverlayStore.getState().reset();
  });
  beforeEach(() => {
    useMapStore.setState({
      mapDocument: {
        overlays: [
          {overlay_id: 'metro', name: 'Metro areas', layer_type: 'line'},
          {overlay_id: 'school', name: 'School districts', layer_type: 'line'},
        ],
      },
    } as any);
    state().reset();
  });

  // enabledOverlayIds holds overlay names; the mask holds an overlay_id.
  test('hiding an overlay releases its own mask or armed selection', () => {
    state().selectOverlayFeature('metro');
    expect(state().enabledOverlayIds.has('Metro areas')).toBe(true);
    state().toggleOverlay('Metro areas');
    expect(state().selectingLayerId).toBeNull();
    expect(state().enabledOverlayIds.has('Metro areas')).toBe(false);

    state().enableOverlay('Metro areas');
    mask('metro');
    state().toggleOverlay('Metro areas');
    expect(state().paintConstraint).toBeNull();
    expect(state().enabledOverlayIds.has('Metro areas')).toBe(false);
  });

  test('hiding another overlay leaves the mask in place', () => {
    state().enableOverlay('School districts');
    mask('metro');
    state().toggleOverlay('School districts');
    expect(state().paintConstraint?.overlayId).toBe('metro');
  });

  test('arming a mask shows only its layer and releases the current mask', () => {
    state().enableOverlay('School districts');
    mask('school');
    state().selectOverlayFeature('metro');
    expect([...state().enabledOverlayIds]).toEqual(['Metro areas']);
    expect(state().paintConstraint).toBeNull();
    expect(state().selectingLayerId).toBe('metro');
  });

  test('releasing a mask restores the layers it hid, minus any hidden meanwhile', () => {
    useMapControlsStore.getState().setMapOptions({showCountyBoundaries: true});
    state().enableOverlay('School districts');
    state().enableOverlay('Metro areas');
    state().selectOverlayFeature('metro');
    expect(useMapControlsStore.getState().mapOptions.showCountyBoundaries).toBe(false);
    mask('metro');
    state().selectOverlayFeature('school'); // re-arm keeps the original snapshot
    state().clearPaintConstraint();
    expect([...state().enabledOverlayIds].sort()).toEqual(['Metro areas', 'School districts']);
    expect(useMapControlsStore.getState().mapOptions.showCountyBoundaries).toBe(true);

    state().selectOverlayFeature('metro');
    state().toggleOverlay('Metro areas'); // hiding the armed layer releases it
    expect([...state().enabledOverlayIds]).toEqual(['School districts']);
  });

  test('masking keeps the Paint by overlay drawn, so its brush still finds areas', () => {
    useMapControlsStore.getState().setMapOptions({paintBy: 'overlay:school'});
    state().selectOverlayFeature('metro');
    expect([...state().enabledOverlayIds].sort()).toEqual(['Metro areas', 'School districts']);
  });

  test('hiding the Paint by overlay falls back to painting units', () => {
    useMapControlsStore.getState().setMapOptions({paintBy: 'overlay:school'});
    state().enableOverlay('School districts');
    state().toggleOverlay('School districts');
    expect(useMapControlsStore.getState().mapOptions.paintBy).toBe('units');
  });
});
