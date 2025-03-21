'use client';
import {IconButton} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {MoveIcon, RotateCounterClockwiseIcon} from '@radix-ui/react-icons';
import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {ActiveTool} from '@constants/types';
import Draggable from 'react-draggable';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {ToolControls} from '@/app/components/Toolbar/ToolControls';
import {useActiveTools} from '@/app/components/Toolbar/ToolUtils';
import {ToolButtons} from './ToolButtons';

export const Toolbar = () => {
  const activeTool = useMapStore(state => state.activeTool);
  const setActiveTool = useMapStore(state => state.setActiveTool);
  const [showShortcuts, setShowShortcuts] = useState(false);
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
    setMaxXY(
      Math.round((width - toolbarWidth) / 10) * 10 - 25,
      Math.round((height - toolbarHeight) / 10) * 10 - 25
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

  useEffect(() => {
    // add a listener for option or alt key press and release
    const handleKeyPress = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const mapIsLocked = useMapStore.getState().mapStatus?.status === 'locked';
      // if active element is an input, don't do anything
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        mapIsLocked
      )
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
    <Draggable
      defaultPosition={isMobile ? {x: 0, y: 0} : {x: x || 100, y: y || 100}}
      position={isMobile ? {x: 0, y: 0} : {x: x || 100, y: y || 100}}
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
      >
        <ToolButtons
          showShortcuts={showShortcuts}
          isMobile={isMobile}
          toolbarItemsRef={toolbarItemsRef}
        />
        {hovered && customizeToolbar && (
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

        <ToolControls isMobile={isMobile} />
      </div>
    </Draggable>
  );
};
