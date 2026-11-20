'use client';
import {useEffect} from 'react';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@store/mapStore';
import {useTooltipStore} from '@store/tooltipStore';
import {setHoverFeatures} from '@utils/map/hoverFeatures';
import {EMPTY_FEATURE_ARRAY, startWindowPan} from '@utils/events/mapEvents';
import {
  classifySpaceFocus,
  isSpacePanHeld,
  setSpacePanHeld,
  shouldStartSpacePan,
} from '@utils/events/spacePan';

// Body class that swaps every tool's map cursor for a grab hand (globals.css).
const SPACE_PAN_CLASS = 'space-pan';

/**
 * Hold Space to move the map under any tool; the map mouse handlers read the
 * flag this sets. Mounted once with the Toolbar, which owns the other tool
 * hotkeys. Releases on window blur and hidden tabs too, since both can
 * swallow the keyup.
 */
export const useSpacePan = () => {
  useEffect(() => {
    // Whether focus last moved with Tab rather than a click: keyboard users
    // keep Space on the control they tabbed to.
    let focusedByKeyboard = false;
    const handlePointerDown = () => {
      focusedByKeyboard = false;
    };
    const release = () => {
      if (!isSpacePanHeld()) return;
      setSpacePanHeld(false);
      document.body.classList.remove(SPACE_PAN_CLASS);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isSpacePanHeld()) {
        // Swallow auto-repeat so the page doesn't scroll while held.
        if (e.code === 'Space') e.preventDefault();
        return;
      }
      if (e.key === 'Tab') focusedByKeyboard = true;
      if (e.code !== 'Space') return;
      const pointerOverMap = !!document.querySelector('.maplibregl-canvas-container:hover');
      const focus = classifySpaceFocus(document.activeElement, focusedByKeyboard);
      if (!shouldStartSpacePan(e, focus, pointerOverMap)) return;
      e.preventDefault();
      setSpacePanHeld(true);
      document.body.classList.add(SPACE_PAN_CLASS);
      setHoverFeatures(EMPTY_FEATURE_ARRAY);
      const {setTooltip, setZoneDescriptionTooltip} = useTooltipStore.getState();
      setTooltip(null);
      setZoneDescriptionTooltip(null);
      const {isPainting, setIsPainting} = useMapControlsStore.getState();
      if (isPainting) {
        // Mid-stroke: end the stroke (it ingests as one gesture on the
        // isPainting flush) and carry the held button on as a pan.
        setIsPainting(false);
        const mapRef = useMapStore.getState().getMapRef();
        if (mapRef) startWindowPan(mapRef, 1);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || !isSpacePanHeld()) return;
      // A focused button activates on Space keyup; without this, the tool
      // button just clicked would toggle back to Move.
      e.preventDefault();
      release();
    };
    const handleVisibilityChange = () => {
      if (document.hidden) release();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', release);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', release);
      release();
    };
  }, []);
};
