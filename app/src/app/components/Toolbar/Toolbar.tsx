'use client';
import {useMapControlsStore} from '@store/mapControlsStore';
import React, {useEffect, useRef, useState} from 'react';
import {ToolControls} from '@/app/components/Toolbar/ToolControls/ToolControls';
import {useActiveTools} from '@/app/components/Toolbar/ToolUtils';
import {ToolButtons} from './ToolButtons';

export const Toolbar: React.FC = () => {
  const isEditing = useMapControlsStore(state => state.isEditing);
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const toolbarItemsRef = useRef<HTMLDivElement | null>(null);
  const activeTools = useActiveTools();
  // The handler reads the latest tools through a ref so the document listeners
  // mount once instead of re-binding on every render (painting re-renders the
  // toolbar constantly via undo/redo state).
  const activeToolsRef = useRef(activeTools);
  activeToolsRef.current = activeTools;

  useEffect(() => {
    // Listen for option/alt to reveal shortcuts, and trigger tool hotkeys.
    const handleKeyPress = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      // if active element is an input, don't do anything
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
        return;
      setShowShortcuts(event.altKey);
      // Dispatch on keydown only — the keyup listener exists just to clear the
      // alt-shortcuts hint. Firing on both would run hotkeys like ⌘Z twice.
      if (event.type !== 'keydown') return;
      const tool = activeToolsRef.current.find(f => f.hotKeyAccessor(event));
      if (tool) {
        event.preventDefault();
        tool.onClick ? tool.onClick() : setActiveTool(tool.mode);
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    document.addEventListener('keyup', handleKeyPress);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      document.removeEventListener('keyup', handleKeyPress);
    };
  }, [setActiveTool]);

  if (!isEditing) return null;
  return (
    <>
      <ToolButtons showShortcuts={showShortcuts} toolbarItemsRef={toolbarItemsRef} />
      <ToolControls />
    </>
  );
};
