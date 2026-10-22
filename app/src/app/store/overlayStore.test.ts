import {beforeEach, expect, test} from 'bun:test';
import {useOverlayStore} from './overlayStore';
import {useMapStore} from './mapStore';

const mask = (overlayId: string) =>
  useOverlayStore.setState({paintConstraint: {overlayId, featureId: 'f', features: []}});
const state = () => useOverlayStore.getState();

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
