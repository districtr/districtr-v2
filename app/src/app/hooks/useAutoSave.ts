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
import {
  AUTOSAVE_DEBOUNCE_MS,
  AUTOSAVE_MAX_WAIT_MS,
  AUTOSAVE_TUNING_DEBOUNCE_MS,
} from '@constants/document/sync';
import {createIdleSaveTimer} from '@utils/sync/idleSaveTimer';
import {useTuningView} from './useTuningView';

// Any of these counts as the user still working, pushing the save back.
const ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
] as const;

/** Whether an input event (or a map move, `'move'`) pushes the save back. In
 * the tuning view only presses do: hovering or scrolling the map to read the
 * numbers mustn't hold off the save that brings back their contiguity. */
export const countsAsActivity = (type: string, tuningView: boolean) =>
  !tuningView || !['pointermove', 'wheel', 'scroll', 'move'].includes(type);

const idleWait = (tuningView: boolean) =>
  tuningView ? AUTOSAVE_TUNING_DEBOUNCE_MS : AUTOSAVE_DEBOUNCE_MS;

// A save that comes due mid-brushstroke checks again this often until the stroke ends.
const PAINTING_RETRY_MS = 1000;

/**
 * Auto-saves pending changes while editing: once the user has been idle for 30
 * seconds (any pointer, key, scroll or map move resets the wait), but no later
 * than 3 minutes after the first unsaved edit; and immediately on tab close/hide
 * or window unfocus. The cap can land mid-gesture: mid-brushstroke it waits for
 * the stroke to end, and an edit made while a save runs stays unsaved for the next.
 *
 * In Super Draw's tuning view the wait is 3 seconds, and only presses (pointer
 * down, keys, touch) reset it; switching the view applies to a save already
 * pending.
 *
 * Returns `isAutoSaving`, true while a timer-driven save runs (held for a
 * minimum beat so an instant save doesn't read as a UI glitch) — drives the
 * "Auto-saving…" popup in the topbar. Not in the tuning view, where saves come
 * every few seconds.
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
  const tuningView = useTuningView();

  // Listeners and timers read through this ref so they always see fresh state.
  const ref = useRef({enabled: false, save, tuningView});
  ref.current = {
    enabled:
      isEditing && access === ACCESS_STATES.EDIT && !!documentId && isOutdated && !repairPending,
    save,
    tuningView,
  };
  const timerRef = useRef<ReturnType<typeof createIdleSaveTimer> | null>(null);

  useEffect(() => {
    // Single-flight: blur and visibilitychange fire together on alt-tab, and a
    // second concurrent save would PUT a stale last_updated_at and fail.
    let saving = false;
    const saveNow = async () => {
      if (!ref.current.enabled || saving) return;
      saving = true;
      try {
        // Silent: autosave shouldn't toast "Map saved" or flash the lock overlay
        // — the topbar cloud icon and "Auto-saving…" popup are enough. The
        // tuning view's saves take no lock at all (see SaveOptions.unlocked).
        await ref.current.save(false, {
          silent: true,
          autosave: true,
          unlocked: ref.current.tuningView,
        });
      } finally {
        saving = false;
      }
    };

    // Timer-driven saves show the "Auto-saving…" popup, held at least 1.5s so a
    // near-instant save doesn't flash by looking like a glitch. Not in the
    // tuning view: saving every few seconds, it would hardly ever go away.
    const saveWithNotice = async () => {
      if (!ref.current.enabled || saving) return;
      if (ref.current.tuningView) return saveNow();
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
    const onActivity = (e: {type: string}) => {
      if (countsAsActivity(e.type, ref.current.tuningView)) timer.activity();
    };
    const endCycle = () => {
      timer.cancel();
      map?.off('move', onActivity);
      map = undefined;
    };
    const timer = createIdleSaveTimer(AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS, () => {
      // The cap can come due mid-brushstroke; the save's lock would cut the stroke off.
      if (useMapControlsStore.getState().isPainting) {
        timer.postpone(PAINTING_RETRY_MS);
        return;
      }
      endCycle();
      saveWithNotice();
    });
    timerRef.current = timer;
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
          map?.on('move', onActivity);
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
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, onActivity, activityOpts));
    return () => {
      timerRef.current = null;
      unsubDistrict();
      unsubCoi();
      disposed = true;
      endCycle();
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, onActivity, activityOpts));
      window.removeEventListener('pagehide', saveNow);
      window.removeEventListener('blur', saveNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // The idle wait follows the tuning view, for a save already pending too.
  // Declared after the effect above, so it also runs once that has made the timer.
  useEffect(() => {
    timerRef.current?.setIdle(idleWait(tuningView));
  }, [tuningView]);

  return {isAutoSaving};
}
