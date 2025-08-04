'use client';
import {Text} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import React, {useLayoutEffect, useRef, useState} from 'react';
import {BrushControls} from '@components/BrushControls';
import {ZoneLockPicker} from '@/app/components/Toolbar/ZoneLockPicker';
import {ActiveTool} from '@constants/types';
import {ExitBlockViewButtons} from '@/app/components/Toolbar/ExitBlockViewButtons';
import {useToolbarStore} from '@/app/store/toolbarStore';

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
  pin: {
    Component: () => <React.Fragment />,
  },
};

export const ToolControls: React.FC<{
  isMobile?: boolean;
}> = ({isMobile}) => {
  const {Component} = useMapStore(state => ToolControlsConfig[state.activeTool] || {});
  const {x, y, maxXY, rotation, customizeToolbar, toolbarLocation, toolbarWidth, toolbarHeight} =
    useToolbarStore();
  const isHorizontal =
    toolbarLocation === 'sidebar' || !customizeToolbar || rotation === 'horizontal';
  const ContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldFlip =
    rotation === 'horizontal' ? (y ?? 0) < 200 : (x ?? 0) > (maxXY?.maxX ?? 0) - 200;

  if (!Component) {
    return null;
  }
  return (
    <div
      ref={ContainerRef}
      style={{
        bottom: isHorizontal ? (shouldFlip ? undefined : '100%') : undefined,
        top: isHorizontal ? (shouldFlip ? '100%' : undefined) : '12px',
        left: isHorizontal ? '12px' : shouldFlip ? 'undefined' : '100%',
        right: isHorizontal ? 0 : shouldFlip ? '100%' : undefined,
        minWidth: isHorizontal ? 'calc(100% - 24px)' : 'min(20rem, 30vw)',
      }}
      className={`bg-white w-full ${toolbarLocation === 'sidebar' ? '' : 'absolute shadow-sm border-[1px] border-gray-500 overflow-hidden'} p-4 `}
    >
      <Component />
      <ExitBlockViewButtons />
    </div>
  );
};
