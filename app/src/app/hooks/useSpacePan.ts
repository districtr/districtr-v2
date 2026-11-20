'use client';
import {useEffect} from 'react';
import {useMapControlsStore} from '@store/mapControlsStore';
import {ACTIVE_TOOLS, type ActiveTool} from '@constants/map/tools';
import {spaceHoldsMove} from '@utils/events/spacePan';

/**
 * Hold Space to move the map: Space down switches to the Move tool, Space up
 * switches back to the tool it interrupted. Mounted once with the Toolbar,
 * which owns the other tool hotkeys.
 */
export const useSpacePan = () => {
  useEffect(() => {
    // The tool Space interrupted, while it is held.
    let heldTool: ActiveTool | null = null;
    // Whether focus last moved by keyboard rather than a click (spaceHoldsMove).
    let focusedByKeyboard = false;
    let pointerDown = false;
    let restoreOnPointerUp = false;

    const restore = () => {
      restoreOnPointerUp = false;
      if (heldTool === null) return;
      const {activeTool, setActiveTool} = useMapControlsStore.getState();
      // Unless a tool hotkey pressed meanwhile already picked another.
      if (activeTool === ACTIVE_TOOLS.PAN) setActiveTool(heldTool);
      heldTool = null;
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key.startsWith('Arrow')) focusedByKeyboard = true;
      if (e.code !== 'Space') return;
      if (heldTool !== null) {
        // Auto-repeat while held.
        e.preventDefault();
        return;
      }
      const {activeTool, setActiveTool, isPainting, setIsPainting} = useMapControlsStore.getState();
      if (
        activeTool === ACTIVE_TOOLS.PAN ||
        !spaceHoldsMove(e, document.activeElement, focusedByKeyboard)
      ) {
        return;
      }
      e.preventDefault();
      // A stroke in progress ends here and ingests as one gesture; left open,
      // it would outlive the mouseup, which only closes a Paint or Erase stroke.
      if (isPainting) setIsPainting(false);
      heldTool = activeTool;
      setActiveTool(ACTIVE_TOOLS.PAN);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || heldTool === null) return;
      // A focused button activates on Space keyup; without this the tool
      // button just clicked would toggle back to Move.
      e.preventDefault();
      // Mid-drag, wait for the button: Paint restored under a held button
      // would start painting as the drag crosses units.
      if (pointerDown) restoreOnPointerUp = true;
      else restore();
    };
    const handlePointerDown = () => {
      focusedByKeyboard = false;
      pointerDown = true;
    };
    const handlePointerUp = () => {
      pointerDown = false;
      // After this release's click, so it doesn't land as a paint.
      if (restoreOnPointerUp) setTimeout(restore);
    };
    // A switch away can swallow the keyup.
    const handleBlur = () => {
      pointerDown = false;
      restore();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('blur', handleBlur);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('blur', handleBlur);
      restore();
    };
  }, []);
};
