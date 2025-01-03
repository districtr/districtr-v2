import {Button, Card, Flex, IconButton, IconButtonProps, Text, Tooltip} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {
  EraserIcon,
  Pencil2Icon,
  HandIcon,
  LockOpen1Icon,
  ViewGridIcon,
  GearIcon,
  Cross2Icon,
  CounterClockwiseClockIcon,
  ResetIcon,
} from '@radix-ui/react-icons';
import {RecentMapsModal} from '@components/sidebar/RecentMapsModal';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import Layers from './sidebar/Layers';
import {BrushControls} from './BrushControls';
import {ZoneLockPicker} from './sidebar/ZoneLockPicker';
import {ActiveTool} from '../constants/types';
import {ExitBlockViewButtons} from './sidebar/ExitBlockViewButtons';
import { useTemporalStore } from '../store/temporalStore';
import { debounce } from 'lodash';

const ToolUtilitiesConfig: Record<
  Partial<ActiveTool>,
  {Component?: () => React.JSX.Element; focused?: boolean}
> = {
  pan: {},
  recents: {
    Component: () => <RecentMapsModal defaultOpen />,
  },
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
    focused: true,
  },
  undo: {
    Component: () => <React.Fragment/>
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

const ToolUtilities: React.FC<{activeTool: ActiveTool}> = ({activeTool}) => {
  const ContainerRef = useRef<HTMLDivElement | null>(null);
  const {
    Component,
    // focused
  } = ToolUtilitiesConfig[activeTool] || {};
  // TODO: refinement. The idea here is to have an ephemeral menu that goes away on interaction
  // but it has some weird behavior
  // const setActiveTool = useMapStore(state => state.setActiveTool);

  // useEffect(() => {
  //   const handleClickOutside = (event: MouseEvent) => {
  //     if (ContainerRef.current && !ContainerRef.current.contains(event.target as Node)) {
  //       setActiveTool('pan'); // Set active tool to default
  //     }
  //   };

  //   if (focused) {
  //     document.addEventListener('mousedown', handleClickOutside);
  //   }

  //   return () => {
  //     document.removeEventListener('mousedown', handleClickOutside); // Clean up listener
  //   };
  // }, [focused, setActiveTool]);

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
      className="bottom-20 bg-white shadow-2xl border-gray-500 border-2 w-auto absolute p-0"
    >
      <Component />
      <ExitBlockViewButtons />
    </Card>
  );
};

type ActiveToolConfig = {
  hotkey: string;
  mode: ActiveTool;
  disabled?: boolean;
  label: string;
  variant?: IconButtonProps['variant'];
  color?: IconButtonProps['color'];
  icon: React.JSX.Element;
  iconStyle?: React.CSSProperties;
  onClick?: () => void;
};

export const MapToolbar = () => {
  const activeTool = useMapStore(state => state.activeTool);
  const setActiveTool = useMapStore(state => state.setActiveTool);
  const mapDocument = useMapStore(state => state.mapDocument);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const noZonesAreAssigned = useMapStore(state => !state.zoneAssignments.size);

  const { futureStates, pastStates, redo, undo } = useTemporalStore(
    (state) => state,
  ); // TemporalState<MapStore>
  const setIsTemporalAction = useMapStore(state => state.setIsTemporalAction)
  const handleUndo = useCallback(debounce(undo, 100), [undo]);
  const handleRedo = useCallback(debounce(redo, 100), [redo]);

  const activeTools: ActiveToolConfig[] = [
    {
      hotkey: 'Digit1',
      mode: 'pan',
      disabled: !mapDocument?.document_id,
      label: 'Pan',
      icon: <HandIcon />,
    },
    {
      hotkey: 'Digit2',
      mode: 'brush',
      disabled: !mapDocument?.document_id,
      label: 'Paint',
      icon: <Pencil2Icon />,
    },
    {
      hotkey: 'Digit3',
      mode: 'eraser',
      disabled: !mapDocument?.document_id,
      label: 'Erase',
      icon: <EraserIcon />,
    },
    {
      hotkey: 'KeyZ',
      mode: 'undo',
      disabled: pastStates.length === 0,
      label: 'Undo',
      icon: <ResetIcon />,
      onClick: () => {
        setIsTemporalAction(true)
        handleUndo()
      }
    },
    {
      hotkey: 'KeyX',
      mode: 'undo',
      disabled: futureStates.length === 0,
      label: 'Redo',
      icon: <ResetIcon />,
      iconStyle: {transform: 'rotateY(180deg)'},
      onClick: () => {
        setIsTemporalAction(true)
        handleRedo()
      }
    },
    {
      hotkey: 'Digit4',
      mode: 'shatter',
      disabled: !mapDocument?.child_layer,
      label: 'Break',
      icon: <ViewGridIcon />,
    },
    {
      hotkey: 'Digit5',
      mode: 'lock',
      disabled: !mapDocument?.document_id,
      label: 'Lock',
      icon: <LockOpen1Icon />,
    },
    {
      hotkey: 'Digit6',
      mode: 'settings',
      disabled: false,
      label: 'Settings',
      icon: <GearIcon />,
    },
    {
      hotkey: 'Digit7',
      mode: 'recents',
      disabled: false,
      label: 'Recent Maps',
      icon: <CounterClockwiseClockIcon />,
    },
    {
      hotkey: 'Digit8',
      mode: 'reset',
      label: 'Reset Map',
      variant: 'outline',
      disabled: noZonesAreAssigned,
      color: 'red',
      icon: <Cross2Icon />,
    },
  ];

  useEffect(() => {
    // add a listener for option or alt key press and release
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.altKey) {
        console.log(event.code);
        setShowShortcuts(event.type === 'keydown');
        const tool = activeTools.find(f => f.hotkey === event.code);
        if (tool) {
          tool.onClick ? tool.onClick() : setActiveTool(tool.mode);
        }
      } else {
        if (event.type === 'keyup') {
          setShowShortcuts(false);
        }
        setShowShortcuts(false);
      }
    };
    document.addEventListener('keydown', handleKeyPress);
    document.addEventListener('keyup', handleKeyPress);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, []);
  if (!activeTool) return null;
  return (
    <>
      <Card
        style={{
          left: '50%',
          transform: 'translateX(-50%)',
          position: 'absolute',
          padding: 0,
          overflow: 'visible',
        }}
        className="bottom-8 bg-white shadow-2xl border-gray-500 border-2 w-auto absolute p-0"
      >
        <Flex justify={'center'} align="center" position={'relative'}>
          {activeTools.map((tool, i) => (
            <>
              <Tooltip
                content={showShortcuts ? `⌥ ${tool.hotkey.replace('Digit', '').replace('Key', '')}` : tool.label}
                open={showShortcuts || undefined}
              >
                <IconButton
                  key={`${tool.mode}-flex`}
                  className="cursor-pointer"
                  onClick={() => {
                    if (tool.onClick) {
                      tool.onClick();
                    } else {
                      setActiveTool(activeTool === tool.mode ? 'pan' : tool.mode)
                    }
                  }}
                  style={{
                    marginRight: i === activeTools.length - 1 ? 0 : -1,
                    padding: activeTool === tool.mode ? '0 0' : '.75rem',
                    ...(tool?.iconStyle||{}),
                  }}
                  variant={tool.variant || activeTool === tool.mode ? 'solid' : 'surface'}
                  color={tool.color}
                  radius="none"
                  disabled={tool.disabled}
                  size="3"
                >
                  {tool.icon}
                </IconButton>
              </Tooltip>
            </>
          ))}
        </Flex>
      </Card>
      {/* {showShortcuts && (
        <Flex
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            position: 'absolute',
            padding: 0,
            overflow: 'visible',
          }}
          className="bottom-0 shadow-2xl w-auto absolute p-0"
        >
          {activeTools.map((tool, i) => (
            <Text size="1">⌥+{tool.hotkey.replace('Digit', '')}</Text>
          ))}
        </Flex>
      )} */}

      <ToolUtilities activeTool={activeTool} />
    </>
  );
};
