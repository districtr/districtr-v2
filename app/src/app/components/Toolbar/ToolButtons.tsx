'use client';
import {Flex, IconButton} from '@radix-ui/themes';
import * as Tooltip from '@radix-ui/react-tooltip';
import {useMapControlsStore} from '@store/mapControlsStore';
import React, {useState} from 'react';
import {ACTIVE_TOOLS, type ActiveTool} from '@constants/map/tools';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useActiveTools} from '@/app/components/Toolbar/ToolUtils';

export const ToolButtons: React.FC<{
  showShortcuts: boolean;
  toolbarItemsRef: React.RefObject<HTMLDivElement>;
}> = ({showShortcuts, toolbarItemsRef}) => {
  const activeTool = useMapControlsStore(state => state.activeTool);
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTool | null>(null);
  const toolbarSize = useToolbarStore(state => state.toolbarSize);
  const activeTools = useActiveTools();
  return (
    <Flex
      justify="start"
      align="start"
      ref={toolbarItemsRef}
      direction="row"
      width="100%"
      wrap="wrap"
      data-testid="toolbar"
    >
      {activeTools.map((tool, i) => {
        const IconComponent = tool.icon;
        return (
          <Tooltip.Provider key={`toolbar-tooltip-${i}`}>
            <Tooltip.Root open={showShortcuts || activeTooltip === tool.mode || undefined}>
              <Tooltip.Trigger
                asChild
                style={{
                  flexGrow: 1,
                }}
              >
                <IconButton
                  key={`${tool.mode}-flex`}
                  data-testid={`${tool.mode}-tool`}
                  className={`cursor-pointer ${i === 0 ? 'rounded-l-lg' : ''} ${
                    i === activeTools.length - 1 ? 'rounded-r-lg' : ''
                  } flex-grow`}
                  onMouseEnter={() => setActiveTooltip(tool.mode)}
                  onMouseLeave={() => setActiveTooltip(null)}
                  onClick={() => {
                    if (tool.onClick) {
                      tool.onClick();
                    } else {
                      setActiveTool(activeTool === tool.mode ? ACTIVE_TOOLS.PAN : tool.mode);
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
                  side="top"
                  className="select-none rounded bg-gray-900 px-2 py-1 text-xs text-center text-white"
                  sideOffset={5}
                >
                  {!showShortcuts && (
                    <>
                      {tool.label}
                      <br />
                    </>
                  )}{' '}
                  {tool.hotKeyLabel.split(' + ').map((key, i) => (
                    <span key={i} className="text-xs">
                      {key}
                      <br />
                    </span>
                  ))}
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
