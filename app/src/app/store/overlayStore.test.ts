import {expect, test} from 'bun:test';
import {useOverlayStore} from './overlayStore';
import {useMapStore} from './mapStore';

test('turning an overlay off releases a paint mask picked on it', () => {
  // Same-named layers toggle together; the mask keeps the picked layer's id.
  useMapStore.setState({
    mapDocument: {
      overlays: [
        {overlay_id: 'senate-lines', name: 'State Senate'},
        {overlay_id: 'senate-labels', name: 'State Senate'},
        {overlay_id: 'house-lines', name: 'State House'},
      ],
    } as any,
  });
  const mask = {overlayId: 'senate-labels', featureId: '1', features: []};
  useOverlayStore.setState({
    enabledOverlayIds: new Set(['State Senate', 'State House']),
    paintConstraint: mask,
  });

  useOverlayStore.getState().toggleOverlay('State House');
  expect(useOverlayStore.getState().paintConstraint).toBe(mask);

  useOverlayStore.getState().toggleOverlay('State Senate');
  expect(useOverlayStore.getState().paintConstraint).toBeNull();
  expect([...useOverlayStore.getState().enabledOverlayIds]).toEqual([]);
});
