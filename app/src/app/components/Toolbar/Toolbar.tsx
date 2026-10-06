'use client';
import {useMapControlsStore} from '@store/mapControlsStore';
import React from 'react';
import {ToolControls} from '@/app/components/Toolbar/ToolControls/ToolControls';
import {useActiveTools, useToolHotkeys} from '@/app/components/Toolbar/ToolUtils';
import {ToolButtons} from './ToolButtons';

export const Toolbar: React.FC = () => {
  const isEditing = useMapControlsStore(state => state.isEditing);
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);
  const activeTools = useActiveTools();
  useToolHotkeys(activeTools, setActiveTool);

  if (!isEditing) return null;
  return (
    <>
      <ToolButtons />
      <ToolControls />
    </>
  );
};
