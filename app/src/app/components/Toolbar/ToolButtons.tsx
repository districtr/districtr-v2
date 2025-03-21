'use client';
import {Flex, IconButton} from '@radix-ui/themes';
import * as Tooltip from '@radix-ui/react-tooltip';
import {useMapStore} from '@store/mapStore';
import React, {useState} from 'react';
import {ActiveTool} from '@constants/types';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useActiveTools} from '@/app/components/Toolbar/ToolUtils';

export const ToolButtons: React.FC<{
  showShortcuts: boolean;
  toolbarItemsRef: React.RefObject<HTMLDivElement>;
  isMobile?: boolean;
}> = ({showShortcuts, isMobile, toolbarItemsRef}) => {
  const activeTool = useMapStore(state => state.activeTool);
  const setActiveTool = useMapStore(state => state.setActiveTool);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTool | null>(null);
  const {rotation: userRotation, customizeToolbar, toolbarSize} = useToolbarStore(state => state);
  const activeTools = useActiveTools();
  const rotation = customizeToolbar && !isMobile ? userRotation : 'horizontal';

  return (
    <Flex
      justify={'center'}
      align="center"
      ref={toolbarItemsRef}
      direction={rotation === 'horizontal' ? 'row' : 'column'}
      className="shadow-md overflow-hidden bg-white"
      width="100%"
    >
      {activeTools.map((tool, i) => {
        const IconComponent = tool.icon;
        return (
          <Tooltip.Provider key={`toolbar-tooltip-${i}`}>
            <Tooltip.Root open={showShortcuts || activeTooltip === tool.mode || undefined}>
              <Tooltip.Trigger
                asChild
                style={{
                  flexGrow: isMobile ? 1 : undefined,
                }}
              >
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
  );
};
