'use client';
import {useMapControlsStore} from '@store/mapControlsStore';
import React, {useEffect, useRef} from 'react';
import {ToolControls} from '@/app/components/Toolbar/ToolControls/ToolControls';
import {useActiveTools} from '@/app/components/Toolbar/ToolUtils';
import {ToolButtons} from './ToolButtons';

export const Toolbar: React.FC = () => {
  const isEditing = useMapControlsStore(state => state.isEditing);
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);
  const toolbarItemsRef = useRef<HTMLDivElement | null>(null);
  const activeTools = useActiveTools();
  // The handler reads the latest tools through a ref so the document listener
  // mounts once instead of re-binding on every render (painting re-renders the
  // toolbar constantly via undo/redo state).
  const activeToolsRef = useRef(activeTools);
  activeToolsRef.current = activeTools;

  useEffect(() => {
    // Trigger tool hotkeys.
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      // if active element is an input, don't do anything
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
        return;
      const tool = activeToolsRef.current.find(f => f.hotKeyAccessor(event));
      if (tool) {
        event.preventDefault();
        tool.onClick ? tool.onClick() : setActiveTool(tool.mode);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [setActiveTool]);

  if (!isEditing) return null;
  return (
    <>
      <ToolButtons toolbarItemsRef={toolbarItemsRef} />
      <ToolControls />
    </>
  );
};
