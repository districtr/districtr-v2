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

  useEffect(() => {
    // Listen for option/alt to reveal shortcuts, and trigger tool hotkeys.
    const handleKeyPress = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      // if active element is an input, don't do anything
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
        return;
      if (event.altKey) {
        setShowShortcuts(true);
      } else {
        setShowShortcuts(false);
      }

      const tool = activeTools.find(f => f.hotKeyAccessor(event));
      if (tool) {
        event.preventDefault();
        tool.onClick ? tool.onClick() : setActiveTool(tool.mode);
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    document.addEventListener('keyup', handleKeyPress);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  if (!isEditing) return null;
  return (
    <>
      <ToolButtons showShortcuts={showShortcuts} toolbarItemsRef={toolbarItemsRef} />
      <ToolControls />
    </>
  );
};
