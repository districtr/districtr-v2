'use client';
import {Flex, IconButton} from '@radix-ui/themes';
import * as Tooltip from '@radix-ui/react-tooltip';
import {useMapStore} from '@store/mapStore';
import {MoveIcon, RotateCounterClockwiseIcon} from '@radix-ui/react-icons';
import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {ActiveTool} from '@constants/types';
import Draggable from 'react-draggable';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {ToolUtilities} from '@components/Toolbar/ToolUtilities';
import {useActiveTools} from '@components/Toolbar/ToolbarUtils';

export const Toolbar = () => {
  const activeTool = useMapStore(state => state.activeTool);
  const setActiveTool = useMapStore(state => state.setActiveTool);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTool | null>(null);
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
  } = useToolbarStore(state => state);
  const [hovered, setHovered] = useState(false);
  const mapRef = useMapStore(state => state.getMapRef());
  const containerRef = mapRef?._canvas;
  const toolbarItemsRef = useRef<HTMLDivElement | null>(null);
  const previousActiveTool = useRef<ActiveTool | null>(null);
  const activeTools = useActiveTools();

  const [x, y] = customizeToolbar ? [userX, userY] : [defaultX, defaultY];
  const rotation = customizeToolbar ? userRotation : 'horizontal';

  const handleResize = () => {
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
      containerRef.getBoundingClientRect().width / 2 - (toolbarWidth || 0) / 2,
      containerRef.getBoundingClientRect().height - 50
    );
  };

  useLayoutEffect(() => {
    // listen for whenever containerRef changes size
    if (!containerRef) return;
    handleResize();
    const observer = new ResizeObserver(handleResize);
    observer.observe(containerRef);

    return () => {
      observer.disconnect();
    };
  }, [mapRef]);

  useLayoutEffect(handleResize, [rotation, toolbarSize]);

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
    <Draggable
      defaultPosition={{x: x || 100, y: y || 100}}
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
        <Flex
          justify={'center'}
          align="center"
          ref={toolbarItemsRef}
          direction={rotation === 'horizontal' ? 'row' : 'column'}
          className="shadow-md overflow-hidden bg-white"
        >
          {activeTools.map((tool, i) => {
            const IconComponent = tool.icon;
            return (
              <Tooltip.Provider key={`toolbar-tooltip-${i}`}>
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
                        width: toolbarSize,
                        height: toolbarSize,
                        ...(tool?.iconStyle || {}),
                      }}
                      variant={tool.variant || activeTool === tool.mode ? 'solid' : 'surface'}
                      color={tool.color}
                      radius="none"
                      disabled={tool.disabled}
                    >
                      <IconComponent width={toolbarSize * 0.4} height={toolbarSize * 0.4} />
                    </IconButton>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side={rotation === 'horizontal' ? 'top' : 'right'}
                      className="select-none rounded bg-gray-900 px-2 py-1 text-xs text-center text-white"
                      sideOffset={5}
                    >
                      {!showShortcuts && (
                        <>
                          {tool.label}
                          <br />
                        </>
                      )}{' '}
                      {rotation === 'horizontal' ? (
                        tool.hotKeyLabel.split(' + ').map((key, i) => (
                          <span key={i} className="text-xs">
                            {key}
                            <br />
                          </span>
                        ))
                      ) : (
                        <span className="text-xs">{tool.hotKeyLabel}</span>
                      )}
                      <Tooltip.Arrow className="fill-gray-900" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </Tooltip.Provider>
            );
          })}
        </Flex>
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

        <ToolUtilities />
      </div>
    </Draggable>
  );
};
