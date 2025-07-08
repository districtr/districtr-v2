'use client';
import {Box, Flex, IconButton, Tooltip} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {MoveIcon, PinRightIcon, RotateCounterClockwiseIcon} from '@radix-ui/react-icons';
import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {ActiveTool} from '@constants/types';
import Draggable from 'react-draggable';
import {ToolbarState, useToolbarStore} from '@/app/store/toolbarStore';
import {ToolControls} from '@/app/components/Toolbar/ToolControls';
import {useActiveTools} from '@/app/components/Toolbar/ToolUtils';
import {ToolButtons} from './ToolButtons';

const TOOLBAR_PADDING = 12;

export const Toolbar: React.FC<{overrideRotation?: ToolbarState['rotation']}> = () => {
  const activeTool = useMapStore(state => state.activeTool);
  const setActiveTool = useMapStore(state => state.setActiveTool);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const {
    x: userX,
    y: userY,
    customizeToolbar,
    defaultX,
    defaultY,
    isMobile,
  } = useToolbarStore(state => state);
  const toolbarItemsRef = useRef<HTMLDivElement | null>(null);
  const activeTools = useActiveTools();

  const [x, y] = customizeToolbar && !isMobile ? [userX, userY] : [defaultX, defaultY];

  useEffect(() => {
    // add a listener for option or alt key press and release
    const handleKeyPress = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      // if active element is an input, don't do anything
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
        return;
      // if alt, showShortcuts
      if (event.altKey) {
        setShowShortcuts(true);
      } else {
        setShowShortcuts(false);
      }

      const tool = activeTools.find(f => f.hotKeyAccessor(event));
      if (tool) {
        event.preventDefault();
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
    <>
      <ToolButtons
        showShortcuts={showShortcuts}
        isMobile={isMobile}
        toolbarItemsRef={toolbarItemsRef}
      />
      <ToolControls isMobile={isMobile} />
    </>
  );
};

export const DraggableToolbar = () => {
  const activeTool = useMapStore(state => state.activeTool);
  const setActiveTool = useMapStore(state => state.setActiveTool);
  const setToolbarLocation = useToolbarStore(state => state.setToolbarLocation);
  const {
    x: userX,
    y: userY,
    rotation: userRotation,
    setXY,
    setRotation,
    setMaxXY,
    toolbarSize,
    setDefaultXY,
    customizeToolbar,
    defaultX,
    defaultY,
    setIsMobile,
    isMobile,
    setToolbarWidth,
    setToolbarHeight,
  } = useToolbarStore(state => state);
  const [hovered, setHovered] = useState(false);
  const mapRef = useMapStore(state => state.getMapRef());
  const containerRef = mapRef?._canvas;
  const toolbarItemsRef = useRef<HTMLDivElement | null>(null);
  const previousActiveTool = useRef<ActiveTool | null>(null);
  const activeTools = useActiveTools();

  const [x, y] = customizeToolbar && !isMobile ? [userX, userY] : [defaultX, defaultY];
  const rotation = customizeToolbar && !isMobile ? userRotation : 'horizontal';

  const handleContainerResize = () => {
    if (!containerRef) return;
    const {width, height} = containerRef.getBoundingClientRect() || {
      width: 0,
      height: 0,
    };
    const {width: toolbarWidth, height: toolbarHeight} =
      toolbarItemsRef.current?.getBoundingClientRect() || {width: 0, height: 0};
    
    // Update toolbar dimensions in store
    setToolbarWidth(toolbarWidth);
    setToolbarHeight(toolbarHeight);
    
    setMaxXY(
      width - toolbarWidth + TOOLBAR_PADDING,
      height - TOOLBAR_PADDING
    );
    setDefaultXY(
      containerRef.getBoundingClientRect().width / 2 - (toolbarWidth ?? 0) / 2,
      containerRef.getBoundingClientRect().height - 50
    );
    setIsMobile(containerRef?.clientWidth < activeTools.length * toolbarSize * 2);
  };

  useLayoutEffect(() => {
    // listen for whenever containerRef changes size
    if (!containerRef) return;
    handleContainerResize();
    const observer = new ResizeObserver(handleContainerResize);
    observer.observe(containerRef);

    return () => {
      observer.disconnect();
    };
  }, [mapRef]);

  useLayoutEffect(handleContainerResize, [rotation, toolbarSize]);

  if (!activeTool) return null;

  return (
    <Draggable
      defaultPosition={isMobile ? {x: 0, y: 0} : {x: x === null ? 100 : x, y: y === null ? 100 : y}}
      position={isMobile ? {x: 0, y: 0} : {x: x === null ? 100 : x, y: y === null ? 100 : y}}
      handle="#handle"
      grid={[10, 10]}
      onStart={() => {
        previousActiveTool.current = activeTool;
        setActiveTool('pan');
      }}
      onDrag={(e, {x, y}) => {
        setXY(x, y);
      }}
      onStop={(e, {x, y}) => {
        setXY(x, y, true);
        setActiveTool(previousActiveTool.current || 'pan');
      }}
    >
      <div
        className={`w-full z-[1000] ${!isMobile && 'absolute w-min p-3'}`}
        style={{
          opacity: x === null || y === null ? 0 : 1,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        ref={toolbarItemsRef}
      >
        <Toolbar />
        {hovered && customizeToolbar && (
          <Flex
            id="icon-button-group"
            className={`absolute left-4 top-[-10px]`}
            direction={'row'}
            gap="3"
          >
            <Tooltip content="Move the toolbar">
              <IconButton
                id="handle"
                className={`cursor-move w-min rounded-none ${hovered ? '' : 'hidden'}`}
                variant="ghost"
                style={{
                  background: 'rgba(255,255,255,0.8)',
                  cursor: 'move',
                }}
              >
                <MoveIcon fontSize={'12'} />
              </IconButton>
            </Tooltip>
            <Tooltip content="Rotate the toolbar">
              <IconButton
                id="rotate"
                onClick={() => setRotation(rotation === 'horizontal' ? 'vertical' : 'horizontal')}
                className={`cursor-move w-min rounded-none ${hovered ? '' : 'hidden'}`}
                variant="ghost"
                style={{
                  background: 'rgba(255,255,255,0.8)',
                  cursor: 'rotate',
                }}
              >
                <RotateCounterClockwiseIcon fontSize={'12'} />
              </IconButton>
            </Tooltip>
            <Tooltip content="Move the toolbar to the sidebar">
              <IconButton
                id="rotate"
                onClick={() => {
                  setToolbarLocation('sidebar');
                }}
                className={`cursor-move w-min rounded-none ${hovered ? '' : 'hidden'}`}
                variant="ghost"
                style={{
                  background: 'rgba(255,255,255,0.8)',
                  cursor: 'rotate',
                }}
              >
                <PinRightIcon fontSize={'12'} />
              </IconButton>
            </Tooltip>
          </Flex>
        )}
      </div>
    </Draggable>
  );
};
