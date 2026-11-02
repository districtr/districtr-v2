import {afterEach, beforeEach, expect, test} from 'bun:test';
import {handleMaskToolClick, handleMaskToolHover} from './mapEvents';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
import {useToolbarStore} from '@/app/store/toolbarStore';

const initialOverlay = useOverlayStore.getState();
const initialControls = useMapControlsStore.getState();
const initialMap = useMapStore.getState();
let constrained: Array<[string, string]> = [];
const event = {
  point: {x: 1, y: 1},
  target: {getLayer: () => ({}), queryRenderedFeatures: () => [{id: 7}]},
} as any;

beforeEach(() => {
  constrained = [];
  useOverlayStore.setState({
    maskByLayerId: 'metro',
    selectingLayerId: null,
    setPaintConstraint: (layerId: string, featureId: string) => {
      constrained.push([layerId, featureId]);
    },
  } as any);
});
afterEach(() => {
  useOverlayStore.setState(initialOverlay);
  useMapControlsStore.setState(initialControls);
  useMapStore.setState(initialMap);
});

test('a Mask tool click masks the clicked area of the Mask by layer', () => {
  expect(handleMaskToolClick(event)).toBe(true);
  expect(constrained).toEqual([['metro', '7']]);
});

test('a Boundaries-row selection made with the Mask tool open takes the click and hover', () => {
  useOverlayStore.setState({selectingLayerId: 'school'});
  expect(handleMaskToolClick(event)).toBe(false);
  expect(handleMaskToolHover(event)).toBe(false);
  expect(constrained).toEqual([]);
});

test('leaving Super Draw drops its tools and Paint by modes', () => {
  useMapStore.setState({mapStatus: {access: 'edit'}, captiveIds: new Set<string>()} as any);
  useToolbarStore.getState().setSuperDraw(true);
  useMapControlsStore.getState().setMapOptions({paintBy: 'blocks'});
  useMapControlsStore.getState().setActiveTool('mask');
  useToolbarStore.getState().setSuperDraw(false);
  expect(useMapControlsStore.getState().activeTool).toBe('pan');
  expect(useMapControlsStore.getState().mapOptions.paintBy).toBe('units');
});
