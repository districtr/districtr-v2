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
  lock: {
    Component: ZoneLockPicker,
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
};

export const ToolControls: React.FC<{
  isMobile?: boolean;
}> = ({isMobile}) => {
  const {Component} = useMapStore(state => ToolControlsConfig[state.activeTool] || {});
  const {x, y, maxXY, rotation, customizeToolbar} = useToolbarStore();
  const isHorizontal = !customizeToolbar || rotation === 'horizontal';
  const ContainerRef = useRef<HTMLDivElement | null>(null);
  const [shouldFlip, setShouldFlip] = useState(false);
  const mapDocument = useMapStore(state => state.mapDocument);

  useLayoutEffect(() => {
    const bbox = ContainerRef?.current?.getBoundingClientRect?.();
    if (bbox === undefined || y === null || x === null || maxXY === null) {
      return;
    }
    if (isMobile || !customizeToolbar) {
      setShouldFlip(false);
    } else if (rotation === 'horizontal') {
      const midPoint = maxXY.maxY ? maxXY.maxY / 2 : 0;
      setShouldFlip(y < midPoint);
    } else {
      const midPoint = maxXY.maxX ? maxXY.maxX / 2 : 0;
      setShouldFlip(x > midPoint);
    }
  }, [y, x, rotation, Component]);

  if (!Component) {
    return null;
  }
  return (
    <div
      ref={ContainerRef}
      style={{
        bottom: isHorizontal ? (shouldFlip ? undefined : '100%') : undefined,
        top: isHorizontal ? (shouldFlip ? '100%' : undefined) : '10px',
        left: isHorizontal ? '0' : shouldFlip ? 'undefined' : '100%',
        right: isHorizontal ? 0 : shouldFlip ? '100%' : undefined,
        minWidth: isHorizontal ? '100%' : 'min(20rem, 30vw)',
      }}
      className="bg-white shadow-sm border-[1px] border-gray-500 w-full absolute p-4 overflow-hidden"
    >
      <Component />
      <ExitBlockViewButtons />
    </div>
  );
};
