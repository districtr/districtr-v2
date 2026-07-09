'use client';
import {useEffect, useRef, useState} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useCoiAssignmentsStore} from '@/app/store/coiAssignmentsStore';
import {useMapSaveStatus} from './useMapSaveStatus';
import {ACCESS_STATES} from '@constants/document/state';
import {AUTOSAVE_INTERVAL_MS, AUTOSAVE_IDLE_MS} from '@constants/document/sync';

/**
 * Auto-saves pending changes while editing: on tab close/hide, on window
 * unfocus, and every 3 minutes — the periodic save waits for a 45s pause since
 * the last edit so it never fires mid-brushstroke.
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
    // Latest client edit across both map types ("last paint").
    const lastEditMs = () =>
      Math.max(
        Date.parse(useAssignmentsStore.getState().clientLastUpdated) || 0,
        Date.parse(useCoiAssignmentsStore.getState().clientLastUpdated) || 0
      );

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

    let idleTimer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (!ref.current.enabled) return;
      const idle = Date.now() - lastEditMs();
      if (idle < AUTOSAVE_IDLE_MS) {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(attempt, AUTOSAVE_IDLE_MS - idle);
      } else {
        saveWithNotice();
      }
    };
    const interval = setInterval(attempt, AUTOSAVE_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveNow();
    };
    window.addEventListener('pagehide', saveNow);
    window.addEventListener('blur', saveNow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      clearTimeout(idleTimer);
      window.removeEventListener('pagehide', saveNow);
      window.removeEventListener('blur', saveNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return {isAutoSaving};
}
