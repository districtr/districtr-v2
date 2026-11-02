'use client';
import {TargetIcon} from '@radix-ui/react-icons';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {MapPill} from './MapPill';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {ACTIVE_TOOLS} from '@constants/map/tools';

/**
 * Guides the overlay paint-mask flow: prompts for a feature to select while
 * an overlay's "choose an area" is armed, then offers to release the mask
 * once one is chosen. Escape releases/cancels either way.
 */
export const PaintConstraintPill = () => {
  const paintConstraint = useOverlayStore(state => state.paintConstraint);
  const selectingLayerId = useOverlayStore(state => state.selectingLayerId);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  // Paint-mask creation is a Super Draw feature (releasing stays available).
  const superDraw = useToolbarStore(state => state.superDraw);
  // While Paint by blocks is picking or in a unit its own pill sits in the same
  // spot and owns Escape; the mask stays on and its pill comes back after. A
  // mask being picked still prompts (BlockModePill steps aside for it).
  const blockModeActive = useMapStore(state => state.captiveIds.size > 0);
  const pickingUnit = useMapControlsStore(state => state.activeTool === ACTIVE_TOOLS.SHATTER);
  if ((blockModeActive || pickingUnit) && !selectingLayerId) return null;

  if (paintConstraint) {
    return (
      <MapPill
        testId="paint-constraint-pill"
        onEscape={clearPaintConstraint}
        action={{label: 'Unmask (Esc)', onClick: clearPaintConstraint}}
      >
        Paint mask active
      </MapPill>
    );
  }
  if (superDraw && selectingLayerId) {
    return (
      <MapPill
        testId="paint-constraint-pill"
        icon={
          <TargetIcon
            width={18}
            height={18}
            className="animate-pulse"
            style={{color: 'var(--accent-9)', flexShrink: 0}}
          />
        }
        onEscape={clearPaintConstraint}
      >
        You are selecting an area on the map to paint within.
        <br /> Click the map to select an area, or Esc to cancel.
      </MapPill>
    );
  }
  return null;
};
