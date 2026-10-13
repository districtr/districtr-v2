'use client';
import {useEffect, useState} from 'react';

/**
 * True while the Alt/Option key is held. Hides on window blur too, since
 * alt-tab / app switching can swallow the keyup. Consumers only mount inside
 * draw mode (the Toolbar subtree), so the listeners don't outlive it.
 */
export const useAltHeld = () => {
  const [altHeld, setAltHeld] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAltHeld(false);
    };
    const hide = () => setAltHeld(false);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', hide);
    };
  }, []);

  return altHeld;
};
