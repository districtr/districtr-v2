'use client';
import {useEffect, useRef, useState} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useMapSaveStatus} from './useMapSaveStatus';
import {ACCESS_STATES} from '@constants/document/state';
import {AUTOSAVE_DEBOUNCE_MS} from '@constants/document/sync';

/**
 * Auto-saves pending changes while editing: 30 seconds after a painting session
 * ends (each edit resets the timer, so it never fires mid-brushstroke), and
 * immediately on tab close/hide or window unfocus.
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

  // Listeners and timers read through this ref so they always see fresh state.
  const ref = useRef({enabled: false, save});
  ref.current = {
    enabled: isEditing && access === ACCESS_STATES.EDIT && !!documentId && isOutdated,
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
        await ref.current.save();
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

    // Debounced save: each client edit (paint, comment, undo) bumps the store's
    // clientLastUpdated and resets this timer, so the save lands 30s after the
    // painting session ends. Post-save server syncs also bump clientLastUpdated
    // — those match mapDocument.updated_at and are skipped so a save doesn't
    // reschedule itself.
    let idleTimer: ReturnType<typeof setTimeout>;
    const onClientLastUpdated = (clientLastUpdated: string) => {
      if (clientLastUpdated === useMapStore.getState().mapDocument?.updated_at) return;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(saveWithNotice, AUTOSAVE_DEBOUNCE_MS);
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
    return () => {
      unsubDistrict();
      unsubCoi();
      clearTimeout(idleTimer);
      window.removeEventListener('pagehide', saveNow);
      window.removeEventListener('blur', saveNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return {isAutoSaving};
}
