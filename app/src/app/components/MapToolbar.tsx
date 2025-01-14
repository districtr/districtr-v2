'use client';
import {Button, Card, Flex, IconButton, IconButtonProps, Text} from '@radix-ui/themes';
import * as Tooltip from '@radix-ui/react-tooltip';
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
  MoveIcon,
  RotateCounterClockwiseIcon,
} from '@radix-ui/react-icons';
import {RecentMapsModal} from '@components/sidebar/RecentMapsModal';
import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import Layers from './sidebar/Layers';
import {BrushControls} from './BrushControls';
import {ZoneLockPicker} from './sidebar/ZoneLockPicker';
import {ActiveTool} from '../constants/types';
import {ExitBlockViewButtons} from './sidebar/ExitBlockViewButtons';
import {useTemporalStore} from '../store/temporalStore';
import {debounce} from 'lodash';
import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import Draggable from 'react-draggable';

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

const ToolUtilities: React.FC<{activeTool: ActiveTool; y: null | number, x: null | number, rotation: 'horizontal' | 'vertical' | null}> = ({activeTool, y, x, rotation}) => {
  const ContainerRef = useRef<HTMLDivElement | null>(null);
  const [shouldFlip, setShouldFlip] = useState(false);
  const isHorizontal = rotation === 'horizontal';
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
  useLayoutEffect(() => {
    const bbox = ContainerRef?.current?.getBoundingClientRect?.();
    if (bbox === undefined || y === null || x === null) return;
    if (rotation === 'horizontal') {
      setShouldFlip(bbox.top < 0 || (shouldFlip && bbox.height > y))
    } else {
      setShouldFlip(bbox.left < 0 || (shouldFlip && bbox.width > x));
    }
  }, [y, x, rotation, Component, activeTool]);

  if (!Component) {
    return null;
  }

  return (
    <Card
      ref={ContainerRef}
      style={{
        width: 'calc(100% - 20px)',
        minWidth: "max(20vw, 300px)",
        position: 'absolute',
        bottom: isHorizontal ? shouldFlip ? undefined : '100%' : undefined,
        top: isHorizontal ? shouldFlip ? '100%' : undefined : '10px',
        left: isHorizontal ? 0 : shouldFlip ? undefined : '100%',
        right: isHorizontal ? 0 : shouldFlip ? '100%' : undefined,
        padding: '20px',
        overflow: 'hidden',
      }}
      className="bg-white shadow-sm border-gray-500 border-2 w-auto absolute p-0"
    >
      <Component />
      <ExitBlockViewButtons />
    </Card>
  );
};

type ActiveToolConfig = {
  hotkey: string;
  hotKeyLabel: string;
  mode: ActiveTool;
  disabled?: boolean;
  label: string;
  variant?: IconButtonProps['variant'];
  color?: IconButtonProps['color'];
  icon: React.JSX.Element;
  iconStyle?: React.CSSProperties;
  onClick?: () => void;
};

type ToolbarState = {
  x: number | null;
  y: number | null;
  rotation: 'horizontal' | 'vertical' | null;
  setXY: (x: number, y: number) => void;
  maxXY: {maxX: number | null; maxY: number | null};
  setRotation: (rotation: 'horizontal' | 'vertical' | null) => void;
  setMaxXY: (maxX: number, maxY: number) => void;
};

const useToolbarStore = create(
  persist<ToolbarState>(
    (set, get) => ({
      x: null,
      y: null,
      rotation: 'horizontal',
      setXY: (_x, _y) => {
        const {maxX, maxY} = get().maxXY;
        const x = Math.min(Math.max(_x, 0), maxX || Math.pow(2, 16));
        const y = Math.min(Math.max(_y, 0), maxY || Math.pow(2, 16));
        set({
          x,
          y,
        });
      },
      setRotation: rotation => set({rotation}),
      maxXY: {maxX: null, maxY: null},
      setMaxXY: (maxX, maxY) => {
        set({
          maxXY: {maxX, maxY},
          x: Math.max(Math.min(get().x || 0, maxX), 0),
          y: Math.max(Math.min(get().y || 0, maxY), 0),
        });
      },
    }),
    {
      name: 'toolbarStore',
    }
  )
);

export const MapToolbar = () => {
  const activeTool = useMapStore(state => state.activeTool);
  const setActiveTool = useMapStore(state => state.setActiveTool);
  const mapDocument = useMapStore(state => state.mapDocument);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTool | null>(null);
  const noZonesAreAssigned = useMapStore(state => !state.zoneAssignments.size);
  const {x, y, rotation, setXY, setRotation, setMaxXY} = useToolbarStore(state => state);
  const {futureStates, pastStates, redo, undo} = useTemporalStore(state => state); // TemporalState<MapStore>
  const setIsTemporalAction = useMapStore(state => state.setIsTemporalAction);
  const handleUndo = useCallback(debounce(undo, 100), [undo]);
  const handleRedo = useCallback(debounce(redo, 100), [redo]);
  const [hovered, setHovered] = useState(false);
  const mapRef = useMapStore(state => state.getMapRef());
  const containerRef = mapRef?._canvas;
  const toolbarItemsRef = useRef<HTMLDivElement | null>(null);
  const previousActiveTool = useRef<ActiveTool | null>(null);

  useLayoutEffect(() => {
    // listen for whenever containerRef changes size
    if (!containerRef) return;
    const handleResize = () => {
      const {width, height} = containerRef.getBoundingClientRect() || {
        width: 0,
        height: 0,
      };
      const {width: toolbarWidth, height: toolbarHeight} =
        toolbarItemsRef.current?.getBoundingClientRect() || {width: 0, height: 0};
      setMaxXY(
        Math.round((width - toolbarWidth) / 10) * 10 - 25,
        Math.round((height - toolbarHeight) / 10) * 10 - 25
      );
    };
    handleResize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef);

    if (x === null || y === null) {
      const toolbarWidth = toolbarItemsRef.current?.getBoundingClientRect().width;
      setXY(
        containerRef.getBoundingClientRect().width / 2 - (toolbarWidth || 0) / 2,
        containerRef.getBoundingClientRect().height - 100
      );
    }

    return () => {
      observer.disconnect();
    };
  }, [mapRef]);

  const activeTools: ActiveToolConfig[] = [
    {
      hotkey: 'KeyM',
      hotKeyLabel: 'M',
      mode: 'pan',
      disabled: !mapDocument?.document_id,
      label: 'Move',
      icon: <HandIcon />,
    },
    {
      hotkey: 'KeyP',
      hotKeyLabel: 'P',
      mode: 'brush',
      disabled: !mapDocument?.document_id,
      label: 'Paint',
      icon: <Pencil2Icon />,
    },
    {
      hotkey: 'KeyE',
      hotKeyLabel: 'E',
      mode: 'eraser',
      disabled: !mapDocument?.document_id,
      label: 'Erase',
      icon: <EraserIcon />,
    },
    {
      hotkey: 'KeyZ',
      hotKeyLabel: 'Z',
      mode: 'undo',
      disabled: pastStates.length === 0,
      label: 'Undo',
      icon: <ResetIcon />,
      onClick: () => {
        setIsTemporalAction(true);
        handleUndo();
      },
    },
    {
      hotkey: 'KeyY',
      hotKeyLabel: 'Y',
      mode: 'undo',
      disabled: futureStates.length === 0,
      label: 'Redo',
      icon: <ResetIcon />,
      iconStyle: {transform: 'rotateY(180deg)'},
      onClick: () => {
        setIsTemporalAction(true);
        handleRedo();
      },
    },
    {
      hotkey: 'KeyB',
      hotKeyLabel: 'B',
      mode: 'shatter',
      disabled: !mapDocument?.child_layer,
      label: 'Break',
      icon: <ViewGridIcon />,
    },
    {
      hotkey: 'KeyL',
      hotKeyLabel: 'L',
      mode: 'lock',
      disabled: !mapDocument?.document_id,
      label: 'Lock',
      icon: <LockOpen1Icon />,
    },
    {
      hotkey: 'KeyS',
      hotKeyLabel: 'S',
      mode: 'settings',
      disabled: false,
      label: 'Settings',
      icon: <GearIcon />,
    },
    {
      hotkey: 'KeyR',
      hotKeyLabel: 'R',
      mode: 'recents',
      disabled: false,
      label: 'Recent',
      icon: <CounterClockwiseClockIcon />,
    },
    {
      hotkey: 'KeyQ',
      hotKeyLabel: 'Q',
      mode: 'reset',
      label: 'Reset',
      variant: 'outline',
      disabled: noZonesAreAssigned,
      color: 'red',
      icon: <Cross2Icon />,
    },
  ];

  useEffect(() => {
    // add a listener for option or alt key press and release
    const handleKeyPress = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      // if active element is an input, don't do anything
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
        return;
      // if command/control held down, don't do anything
      if (event.metaKey || event.ctrlKey) return;
      // if alt, showShortcuts
      if (event.altKey) {
        setShowShortcuts(true);
      } else {
        setShowShortcuts(false);
      }
      const tool = activeTools.find(f => f.hotkey === event.code);
      if (tool) {
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

  if (!activeTool) return null;

  return (
    <Draggable
      defaultPosition={{x: x || 100, y: y || 100}}
      handle="#handle"
      onStart={() => {
        previousActiveTool.current = activeTool;
        setActiveTool('pan');
      }}
      onStop={(e, {x, y}) => {
        setXY(x, y);
        setActiveTool(previousActiveTool.current || 'pan');
      }}
      position={{x: x || 100, y: y || 100}}
    >
      <div
        className="p-3 w-min absolute z-[1000]"
        style={{
          opacity: x === null || y === null ? 0 : 1,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="bg-white border-gray-500 border-2 rounded-lg shadow-md">
          <Flex justify={'center'} align="center" ref={toolbarItemsRef} direction={rotation === 'horizontal' ? 'row' : 'column'}>
            {activeTools.map((tool, i) => (
              <>
                <Tooltip.Provider>
                  <Tooltip.Root open={showShortcuts || activeTooltip === tool.mode || undefined}>
                    <Tooltip.Trigger asChild>
                      <IconButton
                        key={`${tool.mode}-flex`}
                        className={`cursor-pointer ${i === 0 ? 'rounded-l-lg' : ''} ${
                          i === activeTools.length - 1 ? 'rounded-r-lg' : ''
                        }`}
                        onMouseEnter={() => setActiveTooltip(tool.mode)}
                        onMouseLeave={() => setActiveTooltip(null)}
                        onClick={() => {
                          if (tool.onClick) {
                            tool.onClick();
                          } else {
                            setActiveTool(activeTool === tool.mode ? 'pan' : tool.mode);
                          }
                        }}
                        style={{
                          marginRight: i === activeTools.length - 1 ? 0 : -1,
                          padding: activeTool === tool.mode ? '0 0' : '.75rem',
                          ...(tool?.iconStyle || {}),
                        }}
                        variant={tool.variant || activeTool === tool.mode ? 'solid' : 'surface'}
                        color={tool.color}
                        radius="none"
                        disabled={tool.disabled}
                        size="3"
                      >
                        {tool.icon}
                      </IconButton>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        side={rotation === 'horizontal' ? 'top' : 'right'}
                        className="select-none rounded bg-white px-2 py-1 text-xs text-center"
                        sideOffset={5}
                      >
                        {!showShortcuts && <>
                          {tool.label}
                          <br/>
                        </>
                          } ⌨️ {" "}{tool.hotKeyLabel}
                        <Tooltip.Arrow className="fill-white" />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                </Tooltip.Provider>
              </>
            ))}
          </Flex>
        </div>
        {hovered && (
          <>
          <IconButton
            id="handle"
            className={`absolute flex-none cursor-move rounded-full shadow-xl ${hovered ? '' : 'hidden'}`}
            variant="ghost"
            style={{
              position: 'absolute',
              background: 'rgba(255,255,255,0.8)',
              top: 0,
              cursor: 'move',
              left: 0,
            }}
            >
            <MoveIcon fontSize={'12'} />
          </IconButton>
          <IconButton
            id="rotate"
            onClick={() => setRotation(rotation === 'horizontal' ? 'vertical' : 'horizontal')}
            className={`absolute flex-none cursor-move rounded-full shadow-xl ${hovered ? '' : 'hidden'}`}
            variant="ghost"
            style={{
              position: 'absolute',
              background: 'rgba(255,255,255,0.8)',
              bottom: rotation === 'horizontal' ? 0 : undefined,
              top: rotation !== 'horizontal' ? 0 : undefined,
              cursor: 'rotate',
              left: rotation === 'horizontal' ? 0 : undefined,
              right: rotation !== 'horizontal' ? 0 : undefined,
            }}
            >
            <RotateCounterClockwiseIcon fontSize={'12'} />
          </IconButton>
            </>
        )}
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

        <ToolUtilities activeTool={activeTool} y={y} x={x} rotation={rotation}/>
      </div>
    </Draggable>
  );
};
