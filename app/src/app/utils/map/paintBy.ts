import type {PaintBy} from '@/app/store/types';
import type {PaintEventHandler} from '@utils/map/types';
import {overlayIdOf} from '@constants/map/paintBy';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {getOverlayName, useOverlayStore} from '@/app/store/overlayStore';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';
import {getFeaturesIntersectingCounties} from '@utils/map/getFeaturesIntersectingCounties';
import {getFeaturesInOverlayAreas} from '@utils/map/getFeaturesInOverlayAreas';

/** The brush's feature picker for a `Paint by` value. Blocks use the plain
 * bbox brush: inside a broken unit the brush is already confined to it. */
export const paintFunctionFor = (paintBy: PaintBy | undefined): PaintEventHandler =>
  paintBy === 'counties'
    ? getFeaturesIntersectingCounties
    : overlayIdOf(paintBy)
      ? getFeaturesInOverlayAreas
      : getFeaturesInBbox;

/**
 * Switch what the brush paints (the Paint by control). Leaving Blocks exits
 * block view; Counties releases a paint mask (county-brush features carry no
 * geometry for the mask's geometric filter); an overlay area turns its layer
 * on so its areas show and can be hit. Re-applying the active tool lets
 * setActiveTool arm (or drop) picking a unit to break for Blocks.
 */
export const setPaintBy = (paintBy: PaintBy) => {
  const {captiveIds, exitBlockView} = useMapStore.getState();
  if (paintBy !== 'blocks' && captiveIds.size) exitBlockView();
  if (paintBy === 'counties') useOverlayStore.getState().clearPaintConstraint();
  const overlayId = overlayIdOf(paintBy);
  const overlayName = overlayId && getOverlayName(overlayId);
  if (overlayName) useOverlayStore.getState().enableOverlay(overlayName);

  const controls = useMapControlsStore.getState();
  controls.setMapOptions({paintBy});
  controls.syncBlockPicking();
};
