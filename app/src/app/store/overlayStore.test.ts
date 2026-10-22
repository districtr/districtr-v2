import {expect, test} from 'bun:test';
import {useOverlayStore} from './overlayStore';
import {useMapStore} from './mapStore';

// enabledOverlayIds holds overlay names; the mask holds an overlay_id (l05).
test('hiding an overlay releases its paint mask and armed selection', () => {
  useMapStore.setState({
    mapDocument: {overlays: [{overlay_id: 'ov-1', name: 'Metro areas', layer_type: 'line'}]},
  } as any);
  const store = useOverlayStore.getState();

  store.selectOverlayFeature('ov-1');
  expect(useOverlayStore.getState().enabledOverlayIds.has('Metro areas')).toBe(true);
  store.toggleOverlay('Metro areas');
  expect(useOverlayStore.getState().selectingLayerId).toBeNull();
  expect(useOverlayStore.getState().enabledOverlayIds.has('Metro areas')).toBe(false);

  store.enableOverlay('Metro areas');
  useOverlayStore.setState({paintConstraint: {overlayId: 'ov-1', featureId: 'f', features: []}});
  store.toggleOverlay('Metro areas');
  expect(useOverlayStore.getState().paintConstraint).toBeNull();
  expect(useOverlayStore.getState().enabledOverlayIds.has('Metro areas')).toBe(false);
});
