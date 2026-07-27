'use client';
import {useMapControlsStore} from '@store/mapControlsStore';
import React from 'react';
import {BrushControls} from '@/app/components/Toolbar/ToolControls/BrushControls';
import {ActiveTool} from '@constants/map/tools';
import {InspectorControls} from '@components/Toolbar/ToolControls/InspectorControls';

const ToolControlsConfig: Record<
  Partial<ActiveTool>,
  {Component?: () => React.JSX.Element; focused?: boolean}
> = {
  pan: {},
  undo: {
    Component: () => <React.Fragment />,
  },
  redo: {
    Component: () => <React.Fragment />,
  },
  brush: {
    Component: BrushControls,
  },
  eraser: {
    Component: BrushControls,
  },
  // The break flow is guided by the on-map BlockModePill (which also hosts
  // the exit control); the sidebar keeps the paint controls, since breaking
  // leads straight into painting blocks.
  shatter: {
    Component: BrushControls,
  },
  inspector: {
    Component: InspectorControls,
  },
};

export const ToolControls: React.FC = () => {
  const {Component} = useMapControlsStore(state => ToolControlsConfig[state.activeTool] || {});

  if (!Component) {
    return null;
  }
  return (
    <div className="bg-white w-full py-4">
      <Component />
    </div>
  );
};
