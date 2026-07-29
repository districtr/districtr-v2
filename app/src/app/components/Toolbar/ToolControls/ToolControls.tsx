'use client';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useMapStore} from '@/app/store/mapStore';
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
  // the exit control); once a unit is broken the sidebar shows the paint
  // controls, since breaking leads straight into painting blocks. Before
  // that there's nothing to paint, so no controls.
  shatter: {
    Component: () => {
      const inBlockView = useMapStore(state => state.captiveIds.size > 0);
      return inBlockView ? <BrushControls /> : <React.Fragment />;
    },
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
