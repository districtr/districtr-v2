import {Box, Button, Card, Flex, IconButton, Popover, RadioCards, Text} from '@radix-ui/themes';
import * as RadioGroup from '@radix-ui/react-radio-group';
import {styled} from '@stitches/react';
import {useMapStore} from '@store/mapStore';
import {
  EraserIcon,
  Pencil2Icon,
  HandIcon,
  LockOpen1Icon,
  ViewGridIcon,
  GearIcon,
  Cross2Icon,
} from '@radix-ui/react-icons';
import {RecentMapsModal} from '@components/sidebar/RecentMapsModal';
import React, {act, Component, useEffect, useRef, useState} from 'react';
import Layers from './sidebar/Layers';
import {BrushControls} from './BrushControls';
import {ZoneLockPicker} from './sidebar/ZoneLockPicker';
import {ActiveTool} from '../constants/types';
import {ResetMapButton} from './sidebar/ResetMapButton';
import { ExitBlockViewButtons } from './sidebar/ExitBlockViewButtons';

const ToolUtilitiesConfig: Record<
  Partial<ActiveTool>,
  {Component: () => React.JSX.Element; focused?: boolean}
> = {
  reset: {
    Component: () => {
      const handleReset = useMapStore(state => state.handleReset);
      return (
        <Flex direction={'column'}>
          <Text size="2">
            Are you sure? This will reset all zone assignments and broken geographies. Resetting
            your map cannot be undone.
          </Text>
          <Button variant="solid" color="red" onClick={handleReset}>
            Reset Map
          </Button>
        </Flex>
      );
    },
    focused: true,
  },
  settings: {
    Component: Layers,
    focused: true
  },
  brush: {
    Component: BrushControls
  },
  eraser: {
    Component: BrushControls
  },
  lock: {
    Component: ZoneLockPicker
  },
  shatter: {
    Component: () => {
      const focusFeatures = useMapStore(state => state.focusFeatures)
      console
      if (focusFeatures.length) {
        return <Text>Focused on {focusFeatures[0].id}</Text>
      } else {
        return <Text>Click a feature to show the census blocks within it</Text>
      }
    }
  }
};

const ToolUtilities: React.FC<{activeTool: ActiveTool}> = ({activeTool}) => {
  const ContainerRef = useRef(null);
  const {Component, focused} = ToolUtilitiesConfig[activeTool] || {};
  const setActiveTool = useMapStore(state => state.setActiveTool);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ContainerRef.current && !ContainerRef.current.contains(event.target as Node)) {
        setActiveTool('pan'); // Set active tool to default
      }
    };

    if (focused) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside); // Clean up listener
    };
  }, [focused, setActiveTool]);

  if (!Component) {
    return null;
  }
  return (
    <Card
      ref={ContainerRef}
      style={{
        left: '50%',
        transform: 'translateX(-50%)',
        position: 'absolute',
        padding: '1rem',
      }}
      className="bottom-16 bg-white shadow-2xl border-gray-500 border-2 w-auto absolute p-0"
    >
      <Component />
      <ExitBlockViewButtons />
    </Card>
  );
};

export const MapToolbar = () => {
  const activeTool = useMapStore(state => state.activeTool);
  const setActiveTool = useMapStore(state => state.setActiveTool);
  const mapDocument = useMapStore(state => state.mapDocument);

  if (!activeTool) return null;

  const activeTools = [
    {mode: 'pan', disabled: false, label: 'Pan', icon: <HandIcon />},
    {mode: 'brush', disabled: false, label: 'Paint', icon: <Pencil2Icon />},
    {mode: 'eraser', disabled: false, label: 'Erase', icon: <EraserIcon />},
    {
      mode: 'shatter',
      disabled: !mapDocument?.child_layer,
      label: 'Break',
      icon: <ViewGridIcon />,
    },
    {
      mode: 'lock',
      disabled: false,
      label: 'Lock',
      icon: <LockOpen1Icon />,
    },
    {
      mode: 'settings',
      disabled: false,
      label: 'Settings',
      icon: <GearIcon />,
    },
    {
      mode: 'reset',
      label: 'Reset Map',
      icon: <Cross2Icon />,
    },
  ];

  return (
    <>
      <Card
        style={{
          left: '50%',
          transform: 'translateX(-50%)',
          position: 'absolute',
          padding: 0,
        }}
        className="bottom-4 bg-white shadow-2xl border-gray-500 border-2 w-auto absolute p-0"
      >
        <Flex justify={'center'} align="center" position={'relative'}>
          {activeTools.map((tool, i) => (
            <IconButton
              key={`${tool.mode}-flex`}
              className="cursor-pointer"
              onClick={() => setActiveTool(activeTool === tool.mode ? 'pan' : tool.mode)}
              style={{
                marginRight: i === activeTools.length - 1 ? 0 : -1,
                padding: activeTool === tool.mode ? '0 0' : '.75rem',
              }}
              variant={activeTool === tool.mode ? 'solid' : 'surface'}
              radius="none"
              size="3"
            >
              {tool.icon}
            </IconButton>
          ))}
        </Flex>
      </Card>

      <ToolUtilities activeTool={activeTool} />
    </>
  );
};
