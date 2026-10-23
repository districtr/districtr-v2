import {describe, expect, test} from 'bun:test';
import {useOverlayStore} from './overlayStore';
import {useMapStore} from './mapStore';

describe('setPaintConstraint', () => {
  test('passes source_layer when querying a pmtiles overlay', () => {
    const feature = {id: '1714000', geometry: {type: 'Polygon', coordinates: []}};
    // Mimics MapLibre: vector sources return nothing without sourceLayer.
    const mapRef = {
      querySourceFeatures: (_source: string, opts?: {sourceLayer?: string}) =>
        opts?.sourceLayer === 'places' ? [feature] : [],
    };
    useMapStore.setState({
      getMapRef: () => mapRef,
      mapDocument: {overlays: [{overlay_id: 'places-line', source_layer: 'places'}]},
    } as any);

    useOverlayStore.getState().setPaintConstraint('places-line', '1714000');

    expect(useOverlayStore.getState().paintConstraint?.features).toHaveLength(1);
  });
});
