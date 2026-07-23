'use client';
import {Flex, Text, Tooltip} from '@radix-ui/themes';
import {useMapControlsStore} from '@store/mapControlsStore';
import React from 'react';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {useActiveTools, type ActiveToolConfig} from '@/app/components/Toolbar/ToolUtils';
import {HelpTip} from '@/app/components/InfoTip/HelpTip';

// Fixed button height (shared by both size groups); width flexes. The old
// user-configurable size picker was removed.
const TOOLBAR_HEIGHT = 56;
const ICON_SIZE = 20;
const COMPACT_ICON_SIZE = 16;

export const ToolButtons: React.FC<{
  toolbarItemsRef: React.RefObject<HTMLDivElement>;
}> = ({toolbarItemsRef}) => {
  const activeTool = useMapControlsStore(state => state.activeTool);
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);
  const activeTools = useActiveTools();
  const mainTools = activeTools.filter(tool => !tool.compact);
  const compactTools = activeTools.filter(tool => tool.compact);

  // Each tool is a `div[role="button"]` rather than a real `<button>`: the help
  // icon needs to sit inline right after the label, inside the same clickable
  // element, and a `<button>` can't legally contain other interactive content
  // (HelpTip's own hover trigger). A div with role="button" carries the same
  // semantics for our purposes without that restriction.
  const renderTool = (tool: ActiveToolConfig, compact: boolean) => {
    const IconComponent = tool.icon;
    const isActive = activeTool === tool.mode;
    const singleKey = tool.hotKeyLabel.length === 1;
    const activate = () => {
      if (tool.disabled) return;
      if (tool.onClick) {
        tool.onClick();
      } else {
        setActiveTool(isActive ? ACTIVE_TOOLS.PAN : tool.mode);
      }
    };
    const button = (
      <div
        key={tool.mode}
        role="button"
        tabIndex={tool.disabled ? -1 : 0}
        aria-pressed={isActive}
        aria-disabled={tool.disabled}
        data-testid={`${tool.mode}-tool`}
        className="cursor-pointer tool-button relative flex flex-col items-center justify-center"
        onClick={activate}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate();
          }
        }}
        style={{
          height: TOOLBAR_HEIGHT,
          flexGrow: 1,
          flexBasis: 0,
          boxSizing: 'border-box',
          padding: 0,
          margin: 0,
          borderRadius: 7,
          background: isActive ? 'var(--accent-9)' : 'transparent',
          color: isActive ? 'var(--accent-contrast)' : 'var(--gray-12)',
          boxShadow: isActive ? '0 1px 3px var(--gray-a7)' : 'inset 0 0 0 1px var(--gray-a6)',
          opacity: tool.disabled ? 0.5 : 1,
          // Not pointerEvents: 'none' — that would also block the nested
          // HelpTip's own hover trigger. `activate()` already no-ops when
          // disabled, so the help icon stays explorable either way.
          cursor: tool.disabled ? 'default' : 'pointer',
        }}
      >
        {/* Single-key shortcuts float in the button's top-right corner; chorded
            ones (⌘Z) would overflow there, so they show in a hover Tooltip
            wrapping the whole button instead (see below). */}
        {singleKey && (
          <Text
            size="1"
            className="absolute top-1 right-1 select-none leading-tight opacity-70"
            style={{fontSize: 8}}
          >
            {tool.hotKeyLabel}
          </Text>
        )}
        <IconComponent
          width={compact ? COMPACT_ICON_SIZE : ICON_SIZE}
          height={compact ? COMPACT_ICON_SIZE : ICON_SIZE}
          style={tool.iconStyle}
        />
        <Flex align="center" gap="1">
          <Text size="1" className="select-none">
            {tool.label}
          </Text>
          {/* Only the main-group tools get their own inline HelpTip; the compact
              (Undo/Redo) group shares one instead — see the trailing item below.
              stopPropagation keeps HelpTip's hover/click content from also
              activating this tool. */}
          {tool.helpKey && !tool.compact && (
            <span onClick={event => event.stopPropagation()}>
              <HelpTip
                tip={tool.helpKey}
                iconColor={isActive ? 'var(--accent-contrast)' : 'var(--accent-11)'}
              />
            </span>
          )}
        </Flex>
      </div>
    );
    if (singleKey) return button;
    return (
      <Tooltip key={tool.mode} content={tool.hotKeyLabel} side="top">
        {button}
      </Tooltip>
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
        {mainTools.map(tool => renderTool(tool, false))}
      </Flex>
      {compactTools.length > 0 && (
        <Flex direction="row" align="center" className="segmented-track">
          {compactTools.map(tool => renderTool(tool, true))}
          {/* One shared HelpTip for the whole compact (Undo/Redo) group, trailing
              after it rather than pinned to either individual button. */}
          {compactTools.some(tool => tool.helpKey) && (
            <HelpTip tip={compactTools.find(tool => tool.helpKey)!.helpKey!} />
          )}
        </Flex>
      )}
    </Flex>
  );
};
