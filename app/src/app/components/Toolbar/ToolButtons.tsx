'use client';
import {Flex, IconButton, Kbd, Text} from '@radix-ui/themes';
import * as Tooltip from '@radix-ui/react-tooltip';
import {useMapControlsStore} from '@store/mapControlsStore';
import React, {useState} from 'react';
import {ACTIVE_TOOLS, type ActiveTool} from '@constants/map/tools';
import {useActiveTools} from '@/app/components/Toolbar/ToolUtils';
import type {ActiveToolConfig} from '@/app/components/Toolbar/ToolUtils';

// Fixed button size; the old user-configurable size picker was removed.
const TOOLBAR_SIZE = 40;
// Taller buttons fit the icon plus a visible label + hotkey (concept 1a:
// tools name themselves instead of hiding labels in tooltips).
const TOOLBAR_HEIGHT = 52;
// Undo/redo are standalone, narrower buttons to the right of the tool group.
const HISTORY_BUTTON_WIDTH = 38;

const HISTORY_TOOLS: ActiveTool[] = [ACTIVE_TOOLS.UNDO, ACTIVE_TOOLS.REDO];

export const ToolButtons: React.FC<{
  showShortcuts: boolean;
  toolbarItemsRef: React.RefObject<HTMLDivElement>;
}> = ({showShortcuts, toolbarItemsRef}) => {
  const activeTool = useMapControlsStore(state => state.activeTool);
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTool | null>(null);
  const activeTools = useActiveTools();
  const mainTools = activeTools.filter(tool => !HISTORY_TOOLS.includes(tool.mode));
  const historyTools = activeTools.filter(tool => HISTORY_TOOLS.includes(tool.mode));

  const renderTool = (tool: ActiveToolConfig, buttonStyle: React.CSSProperties) => {
    const IconComponent = tool.icon;
    const isActive = activeTool === tool.mode;
    return (
      <Tooltip.Provider key={`toolbar-tooltip-${tool.mode}`}>
        <Tooltip.Root open={showShortcuts || activeTooltip === tool.mode || undefined}>
          <Tooltip.Trigger asChild style={{flexGrow: buttonStyle.flexGrow as number | undefined}}>
            <IconButton
              data-testid={`${tool.mode}-tool`}
              className="cursor-pointer tool-button"
              onMouseEnter={() => setActiveTooltip(tool.mode)}
              onMouseLeave={() => setActiveTooltip(null)}
              onClick={() => {
                if (tool.onClick) {
                  tool.onClick();
                } else {
                  setActiveTool(isActive ? ACTIVE_TOOLS.PAN : tool.mode);
                }
              }}
              style={{
                position: 'relative',
                height: TOOLBAR_HEIGHT,
                // Ghost buttons carry negative alignment margins; neutralize inside the track.
                margin: 0,
                borderRadius: 7,
                ...(isActive ? {boxShadow: '0 1px 3px var(--gray-a7)'} : {}),
                ...buttonStyle,
              }}
              variant={tool.variant ?? (isActive ? 'solid' : 'ghost')}
              color={isActive ? tool.color : 'gray'}
              disabled={tool.disabled}
            >
              {/* Single-key shortcuts float in the button's top-right corner;
                  chorded ones (⌘Z) stay tooltip-only. */}
              {tool.hotKeyLabel.length === 1 && (
                <Kbd
                  size="1"
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 4,
                    background: 'transparent',
                    boxShadow: 'none',
                    color: 'inherit',
                    opacity: 0.7,
                  }}
                >
                  {tool.hotKeyLabel}
                </Kbd>
              )}
              <Flex direction="column" align="center" gap="1">
                {/* iconStyle (e.g. redo's mirror transform) applies to the icon only —
                    on the button it would mirror the corner rounding too. */}
                <IconComponent
                  width={TOOLBAR_SIZE * 0.4}
                  height={TOOLBAR_SIZE * 0.4}
                  style={tool.iconStyle}
                />
                <Text size="1">{tool.label}</Text>
              </Flex>
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
  };

  return (
    <Flex
      justify="start"
      align="start"
      ref={toolbarItemsRef}
      direction="row"
      width="100%"
      wrap="wrap"
      gap="2"
      data-testid="toolbar"
    >
      <Flex direction="row" wrap="wrap" className="flex-grow segmented-track">
        {mainTools.map(tool => renderTool(tool, {minWidth: TOOLBAR_SIZE, flexGrow: 1}))}
      </Flex>
      <Flex direction="row" className="segmented-track">
        {historyTools.map(tool => renderTool(tool, {width: HISTORY_BUTTON_WIDTH}))}
      </Flex>
    </Flex>
  );
};
