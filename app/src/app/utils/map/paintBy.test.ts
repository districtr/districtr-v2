import {afterEach, beforeEach, expect, test} from 'bun:test';
import {setPaintBy} from './paintBy';
import {paintByOverlay} from '@constants/map/paintBy';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {getFeaturesIntersectingCounties} from './getFeaturesIntersectingCounties';
import {getOverlayAreaUnderCursor} from './paintOverlayArea';

const initialMap = useMapStore.getState();
const initialControls = useMapControlsStore.getState();
const controls = () => useMapControlsStore.getState();

beforeEach(() => {
  useMapStore.setState({
    mapStatus: {access: 'edit'},
    captiveIds: new Set<string>(),
    mapDocument: {
      overlays: [
        {overlay_id: 'sd', name: 'School districts', layer_type: 'line'},
        {overlay_id: 'metro', name: 'Metro areas', layer_type: 'line'},
      ],
    },
  } as any);
  controls().setActiveTool('brush');
});
afterEach(() => {
  useMapStore.setState(initialMap);
  useMapControlsStore.setState(initialControls);
  useOverlayStore.getState().reset();
});

test('Paint by blocks: Paint and Erase pick a unit to break, then paint inside it', () => {
  setPaintBy('blocks');
  expect(controls().activeTool).toBe('shatter');
  expect(controls().blockPaintTool).toBe('brush');

  controls().setActiveTool('eraser');
  expect(controls().activeTool).toBe('shatter');
  expect(controls().blockPaintTool).toBe('eraser');

  // Inside a broken unit the tool is the one asked for.
  useMapStore.setState({captiveIds: new Set(['block-1'])});
  controls().setActiveTool('brush');
  expect(controls().activeTool).toBe('brush');
});

test('leaving Blocks returns the picking tool to the one it stood in for', () => {
  setPaintBy('blocks');
  controls().setActiveTool('eraser');
  setPaintBy('units');
  expect(controls().activeTool).toBe('eraser');
});

test('Counties releases a mask; an overlay area shows only its layer', () => {
  useOverlayStore.setState({paintConstraint: {overlayId: 'sd', featureId: 'f', features: []}});
  setPaintBy('counties');
  expect(useOverlayStore.getState().paintConstraint).toBeNull();
  expect(controls().paintFunction).toBe(getFeaturesIntersectingCounties);

  useOverlayStore.getState().enableOverlay('Metro areas');
  setPaintBy(paintByOverlay('sd'));
  expect([...useOverlayStore.getState().enabledOverlayIds]).toEqual(['School districts']);
  expect(controls().mapOptions.showCountyBoundaries).toBe(false);
  expect(controls().paintFunction).toBe(getOverlayAreaUnderCursor);
});
