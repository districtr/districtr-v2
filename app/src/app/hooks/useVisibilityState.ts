import {useCallback, useEffect, useState} from 'react';

/**
 * A hook that tracks the document's visibility state.
 * Returns true when the document is visible and false when it's hidden.
 * This is useful for pausing/resuming operations when the tab is not in focus.
 */
export const useVisibilityState = () => {
  // default to visible
  const [visibilityState, setVisibilityState] = useState<DocumentVisibilityState | null>('visible');

  const handleVisibilityChange = useCallback(() => {
    setVisibilityState(document.visibilityState);
  }, []);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return {
    visibilityState,
    isVisible: visibilityState === 'visible',
  };
};
