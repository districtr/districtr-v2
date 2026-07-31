'use client';
import {useMapControlsStore} from '@store/mapControlsStore';
import React from 'react';
import {ToolControlsScaffold} from '@/app/components/Toolbar/ToolControls/ToolControlsScaffold';
import {ActiveTool} from '@constants/map/tools';
import {InspectorControls} from '@components/Toolbar/ToolControls/InspectorControls';

// Every paint-adjacent tool (pan, paint, erase, break) mounts the same
// ToolControlsScaffold regardless of which is active — the scaffold itself
// decides what's interactive per tool. Inspector is the one exception, kept
// on its own separate layout (see InspectorControls).
const ToolControlsConfig: Record<
  Partial<ActiveTool>,
  {Component?: () => React.JSX.Element}
> = {
  pan: {Component: ToolControlsScaffold},
  // Unreachable as activeTool (they fire onClick instead), listed for the type.
  undo: {},
  redo: {},
  brush: {Component: ToolControlsScaffold},
  eraser: {Component: ToolControlsScaffold},
  shatter: {Component: ToolControlsScaffold},
  inspector: {Component: InspectorControls},
};

export const ToolControls: React.FC = () => {
  const {Component} = useMapControlsStore(state => ToolControlsConfig[state.activeTool] || {});

  if (!Component) {
    return null;
  }
  return (
    <div className="bg-white w-full p-4">
      <Component />
    </div>
  );
};
