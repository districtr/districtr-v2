'use client';
import {useEffect} from 'react';
import {useMapStore} from '@/app/store/mapStore';

/**
 * Clears leftover editor state whenever a static (non-map) page is shown. Mounting
 * a static page means we've left the editor, so the catalog's "current map" badge,
 * the save-state indicator, and map render artifacts (zone-number labels) shouldn't
 * carry over from the prior editing session. In-editor view switches stay on the
 * interactive routes and never mount this, so they keep their state.
 */
export const EditorStateReset = () => {
  const resetMapState = useMapStore(state => state.resetMapState);
  useEffect(() => {
    resetMapState();
  }, [resetMapState]);
  return null;
};
