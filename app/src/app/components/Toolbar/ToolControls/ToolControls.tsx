'use client';
import {Text} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import React from 'react';
import {BrushControls} from '@/app/components/Toolbar/ToolControls/BrushControls';
import {ActiveTool} from '@constants/map/tools';
import {ExitBlockViewButtons} from '@/app/components/Toolbar/ExitBlockViewButtons';
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
  shatter: {
    Component: () => {
      const focusFeatures = useMapStore(state => state.focusFeatures);
      if (focusFeatures.length) {
        return <Text>Focused on {focusFeatures[0].id}</Text>;
      } else {
        return <Text>Click a feature to show the census blocks within it</Text>;
      }
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
    <div className="bg-white w-full p-4">
      <Component />
      <ExitBlockViewButtons />
    </div>
  );
};
