'use client';
import {TargetIcon} from '@radix-ui/react-icons';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {MapPill} from './MapPill';

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

  if (paintConstraint) {
    return (
      <MapPill
        testId="paint-constraint-pill"
        onEscape={clearPaintConstraint}
        action={{label: 'Release (Esc)', onClick: clearPaintConstraint}}
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
