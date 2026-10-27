import {afterEach, describe, expect, test} from 'bun:test';
import {useOverlayStore} from './overlayStore';
import {useMapStore} from './mapStore';

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
