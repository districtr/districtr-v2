import {expect, test} from 'bun:test';
import {MAP_LAYER_ANCHOR_ORDER} from './layerRenderConfig';
import {MAP_LAYER_ANCHOR_IDS} from './layerIds';

test('overlay labels anchor sits directly above the overlays anchor', () => {
  const order: readonly string[] = MAP_LAYER_ANCHOR_ORDER;
  expect(order.indexOf(MAP_LAYER_ANCHOR_IDS.overlayLabels)).toBe(
    order.indexOf(MAP_LAYER_ANCHOR_IDS.overlays) - 1
  );
});
