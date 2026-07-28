'use client';
import {Flex, IconButton, Kbd, Text} from '@radix-ui/themes';
import * as Tooltip from '@radix-ui/react-tooltip';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useToolbarStore} from '@store/toolbarStore';
import React from 'react';
import {ACTIVE_TOOLS, type ActiveTool} from '@constants/map/tools';
import {useActiveTools} from '@/app/components/Toolbar/ToolUtils';
import type {ActiveToolConfig} from '@/app/components/Toolbar/ToolUtils';

// Fixed button size; the old user-configurable size picker was removed.
const TOOLBAR_SIZE = 40;
// Taller buttons fit the icon plus a visible label + hotkey (concept 1a:
// tools name themselves instead of hiding labels in tooltips).
const TOOLBAR_HEIGHT = 52;
// Undo/redo are standalone, narrower buttons to the right of the tool group;
// this is their minimum — they grow with the sidebar like the main tools.
const HISTORY_BUTTON_WIDTH = 38;

const HISTORY_TOOLS: ActiveTool[] = [ACTIVE_TOOLS.UNDO, ACTIVE_TOOLS.REDO];

export const ToolButtons: React.FC<{
  showShortcuts: boolean;
}> = ({showShortcuts}) => {
  const activeTool = useMapControlsStore(state => state.activeTool);
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);
  // Shortcut previews (corner hotkey + alt-reveal tooltips) are Super Draw
  // only; the hotkeys themselves still work in plain Draw.
  const showHotkeyHints = useToolbarStore(state => state.superDraw);
  const activeTools = useActiveTools();
  const mainTools = activeTools.filter(tool => !HISTORY_TOOLS.includes(tool.mode));
  const historyTools = activeTools.filter(tool => HISTORY_TOOLS.includes(tool.mode));

  const renderTool = (tool: ActiveToolConfig, buttonStyle: React.CSSProperties) => {
    const IconComponent = tool.icon;
    const isActive = activeTool === tool.mode;
    // Main tools get a corner hotkey badge; history tools (chorded ⌘Z/⌘⇧Z
    // shortcuts, too wide for a corner) get an alt-reveal tooltip instead.
    const isHistoryTool = HISTORY_TOOLS.includes(tool.mode);
    const button = (
      <IconButton
        key={tool.mode}
        data-testid={`${tool.mode}-tool`}
        className="cursor-pointer tool-button"
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
          // Radix ghost buttons use content-box sizing, their own padding, and
          // negative alignment margins; neutralize all three so ghost and solid
          // render the same size (content is centered, so padding can be 0).
          boxSizing: 'border-box',
          padding: 0,
          margin: 0,
          borderRadius: 7,
          boxShadow: isActive ? '0 1px 3px var(--gray-a7)' : 'inset 0 0 0 1px var(--gray-a6)',
          ...buttonStyle,
        }}
        variant={isActive ? 'solid' : 'ghost'}
        color={isActive ? undefined : 'gray'}
        disabled={tool.disabled}
      >
        {/* Main-tool shortcuts float in the button's top-right corner. */}
        {!isHistoryTool && showHotkeyHints && (
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
    );
    // Buttons name themselves (label + corner hotkey), so only history tools
    // need a tooltip — and only while Alt reveals shortcuts, never on hover.
    if (!isHistoryTool || !showHotkeyHints) return button;
    return (
      <Tooltip.Provider key={tool.mode}>
        <Tooltip.Root open={showShortcuts}>
          <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              side="top"
              className="select-none rounded bg-gray-900 px-2 py-1 text-xs text-center text-white"
              sideOffset={5}
            >
              {tool.hotKeyLabel.split(' + ').map((key, i) => (
                <span key={i}>
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
      direction="row"
      width="100%"
      wrap="wrap"
      gap="4"
      data-testid="toolbar"
    >
      {/* Container flexGrow tracks button count so extra sidebar width is
          shared per-button — undo/redo scale at the same rate as the main
          tools instead of staying fixed while the main buttons balloon. */}
      <Flex direction="row" wrap="wrap" gap="1" style={{flexGrow: mainTools.length}}>
        {/* flexBasis 0 (not auto) so every tool gets the same width regardless
            of label length. Wraps because the sidebar resizes down to 140px,
            below the five Super Draw tools' combined minimum. */}
        {mainTools.map(tool =>
          renderTool(tool, {minWidth: TOOLBAR_SIZE, flexGrow: 1, flexBasis: 0})
        )}
      </Flex>
      <Flex direction="row" gapX="1" style={{flexGrow: historyTools.length}}>
        {historyTools.map(tool =>
          renderTool(tool, {minWidth: HISTORY_BUTTON_WIDTH, flexGrow: 1, flexBasis: 0})
        )}
      </Flex>
    </Flex>
  );
};
