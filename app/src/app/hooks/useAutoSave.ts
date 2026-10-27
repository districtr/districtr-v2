'use client';
import {useEffect, useRef, useState} from 'react';
import type {Map as MapLibreMap} from 'maplibre-gl';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useAssignmentRepairStore} from '@/app/store/assignmentRepairStore';
import {useMapSaveStatus} from './useMapSaveStatus';
import {ACCESS_STATES} from '@constants/document/state';
import {AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS} from '@constants/document/sync';
import {createIdleSaveTimer} from '@utils/sync/idleSaveTimer';

// Any of these counts as the user still working, pushing the save back.
const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
] as const;

/**
 * Auto-saves pending changes while editing: once the user has been idle for 30
 * seconds (any pointer, key, scroll or map move resets the wait, so it never
 * fires mid-brushstroke or mid-pan), but no later than 3 minutes after the first
 * unsaved edit; and immediately on tab close/hide or window unfocus.
 *
 * Returns `isAutoSaving`, true while a timer-driven save runs (held for a
 * minimum beat so an instant save doesn't read as a UI glitch) — drives the
 * "Auto-saving…" popup in the topbar.
 */
export function useAutoSave() {
  const {isOutdated, save} = useMapSaveStatus();
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const access = useMapStore(state => state.mapStatus?.access);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const documentId = useMapStore(state => state.mapDocument?.document_id);
  // While this map has assignments to repair, every save is blocked anyway; skipping
  // autosave avoids re-running the check (and refetching blocks) in the background,
  // which would also reset the repair modal's "New" marks. Edits stay in IndexedDB.
  const repairPending = useAssignmentRepairStore(
    state => !!documentId && state.issues?.documentId === documentId
  );

  // Listeners and timers read through this ref so they always see fresh state.
  const ref = useRef({enabled: false, save});
  ref.current = {
    enabled:
      isEditing && access === ACCESS_STATES.EDIT && !!documentId && isOutdated && !repairPending,
    save,
  };

  useEffect(() => {
    // Single-flight: blur and visibilitychange fire together on alt-tab, and a
    // second concurrent save would PUT a stale last_updated_at and fail.
    let saving = false;
    const saveNow = async () => {
      if (!ref.current.enabled || saving) return;
      saving = true;
      try {
        // Silent: autosave shouldn't toast "Map saved" or flash the lock overlay
        // — the topbar cloud icon and "Auto-saving…" popup are enough.
        await ref.current.save(false, {silent: true, autosave: true});
      } finally {
        saving = false;
      }
    };

    // Timer-driven saves show the "Auto-saving…" popup, held at least 1.5s so a
    // near-instant save doesn't flash by looking like a glitch.
    const saveWithNotice = async () => {
      if (!ref.current.enabled || saving) return;
      setIsAutoSaving(true);
      try {
        await Promise.all([saveNow(), new Promise(resolve => setTimeout(resolve, 1500))]);
      } finally {
        setIsAutoSaving(false);
      }
    };

    // Idle save: the first client edit (paint, comment, undo) after a save arms
    // the timer, and any interaction pushes it back until the user goes idle or
    // the cap since that first edit runs out.
    let map: MapLibreMap | undefined;
    let disposed = false;
    const endCycle = () => {
      timer.cancel();
      map?.off('move', timer.activity);
      map = undefined;
    };
    const timer = createIdleSaveTimer(AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS, () => {
      endCycle();
      saveWithNotice();
    });
    const onClientLastUpdated = (clientLastUpdated: string) => {
      // Every save (this one, the Save button, blur) ends by setting clientLastUpdated
      // to the server's updated_at, then copying that onto mapDocument in the same
      // tick. Check once both have landed: a match means the changes are saved, so
      // end the cycle and let the next edit start a fresh cap.
      queueMicrotask(() => {
        if (disposed) return;
        if (clientLastUpdated === useMapStore.getState().mapDocument?.updated_at) {
          endCycle();
          return;
        }
        if (!map) {
          // Programmatic moves (fly-to, keyboard pan) don't come through the DOM.
          map = useMapStore.getState().getMapRef();
          map?.on('move', timer.activity);
        }
        timer.arm();
      });
    };
    const unsubDistrict = useAssignmentsStore.subscribe((state, prev) => {
      if (state.clientLastUpdated !== prev.clientLastUpdated) {
        onClientLastUpdated(state.clientLastUpdated);
      }
    });
    const unsubCoi = useCoiAssignmentsStore.subscribe((state, prev) => {
      if (state.clientLastUpdated !== prev.clientLastUpdated) {
        onClientLastUpdated(state.clientLastUpdated);
      }
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveNow();
    };
    window.addEventListener('pagehide', saveNow);
    window.addEventListener('blur', saveNow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Capture so scrolls inside panes (which don't bubble) count too.
    const activityOpts = {capture: true, passive: true};
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, timer.activity, activityOpts));
    return () => {
      unsubDistrict();
      unsubCoi();
      disposed = true;
      endCycle();
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, timer.activity, activityOpts));
      window.removeEventListener('pagehide', saveNow);
      window.removeEventListener('blur', saveNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return {isAutoSaving};
}
