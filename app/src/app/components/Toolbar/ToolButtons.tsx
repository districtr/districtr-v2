'use client';
import {Flex, IconButton, Kbd, Text} from '@radix-ui/themes';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useUiHintStore} from '@store/uiHintStore';
import React, {useEffect} from 'react';
import {ACTIVE_TOOLS, type ActiveTool} from '@constants/map/tools';
import {useActiveTools} from '@/app/components/Toolbar/ToolUtils';
import type {ActiveToolConfig} from '@/app/components/Toolbar/ToolUtils';
import {HelpTip, HELP_TIP_HOVER_DELAY} from '@/app/components/HelpTip/HelpTip';
import {useAltHeld} from '@/app/hooks/useAltHeld';

// Fixed button size; the old user-configurable size picker was removed.
const TOOLBAR_SIZE = 40;
// Taller buttons fit the icon plus a visible label + hotkey (concept 1a:
// tools name themselves instead of hiding labels in tooltips).
const TOOLBAR_HEIGHT = 52;
// Undo/redo are standalone, narrower buttons to the right of the tool group;
// this is their minimum — they grow with the sidebar at HISTORY_GROW_FACTOR
// of the main tools' per-button rate.
const HISTORY_BUTTON_WIDTH = 38;
const HISTORY_GROW_FACTOR = 0.2;

const HISTORY_TOOLS: ActiveTool[] = [ACTIVE_TOOLS.UNDO, ACTIVE_TOOLS.REDO];

// Chorded labels ('⌘ + Shift + Z') are too wide for a corner badge; condense
// them to symbol form ('⌘⇧Z' / 'Ctrl⇧Z'). Single-letter labels pass through.
const compactHotkeyLabel = (label: string) => label.replace(/Shift/g, '⇧').replace(/\s*\+\s*/g, '');

export const ToolButtons: React.FC = () => {
  const activeTool = useMapControlsStore(state => state.activeTool);
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);
  // Shortcut previews (the corner hotkey badge) appear only while Alt/Option
  // is held — the buttons are too cramped for always-on badges. This component
  // only mounts in draw mode, so the Alt listener doesn't outlive it; mobile
  // has no Alt key, so the held state is effectively desktop-only. The hotkeys
  // themselves always work without the badges.
  const showHotkeyHints = useAltHeld();
  const activeTools = useActiveTools();
  // Guided step (see uiHintStore.guideTargets): the draft helper points at a
  // tool button (`tool:<mode>`) and pulses it until the user arms that tool
  // themselves; a guide pointing at the already-active tool skips ahead.
  const guideTarget = useUiHintStore(state => state.guideTargets[0]);
  const advanceGuide = useUiHintStore(state => state.advanceGuide);
  useEffect(() => {
    if (guideTarget === `tool:${activeTool}`) advanceGuide(guideTarget);
  }, [guideTarget, activeTool, advanceGuide]);
  const mainTools = activeTools.filter(tool => !HISTORY_TOOLS.includes(tool.mode));
  const historyTools = activeTools.filter(tool => HISTORY_TOOLS.includes(tool.mode));
  const renderTool = (tool: ActiveToolConfig, buttonStyle: React.CSSProperties) => {
    const IconComponent = tool.icon;
    const isActive = activeTool === tool.mode;
    // History tools' chorded shortcuts get a compact badge (⌘⇧Z) — the full
    // '⌘ + Shift + Z' form is too wide for their narrow buttons.
    const isHistoryTool = HISTORY_TOOLS.includes(tool.mode);
    const button = (
      <IconButton
        key={tool.mode}
        data-testid={`${tool.mode}-tool`}
        aria-label={tool.label}
        className={`cursor-pointer tool-button ${
          guideTarget === `tool:${tool.mode}` ? 'ui-guide' : ''
        }`}
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
        {/* Shortcuts float in the button's top-right corner while Alt is held. */}
        {showHotkeyHints && (
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
              whiteSpace: 'nowrap',
              ...(isHistoryTool ? {fontSize: 9, letterSpacing: 0} : {}),
            }}
          >
            {isHistoryTool ? compactHotkeyLabel(tool.hotKeyLabel) : tool.hotKeyLabel}
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
    // Every main tool shares one of the two combination entries (see
    // ToolUtils' combinationHelpKey / 'superdrawToolsCombination'), so its
    // hover card would describe every tool in the group rather than just
    // this button — text="" suppresses that description, leaving only the
    // demonstration link. Shortcuts no longer ride along in the hover card;
    // they're revealed by holding Alt/Option instead (corner badges above).
    return tool.helpKey ? (
      <HelpTip key={tool.mode} tip={tool.helpKey} openDelay={HELP_TIP_HOVER_DELAY} text="">
        {button}
      </HelpTip>
    ) : (
      button
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
          shared per-button — undo/redo grow with the sidebar instead of
          staying fixed, but at half rate so they stay visually secondary. */}
      <Flex direction="row" wrap="wrap" gap="1" style={{flexGrow: mainTools.length}}>
        {/* flexBasis 0 (not auto) so every tool gets the same width regardless
            of label length. Wraps because the sidebar resizes down to 140px,
            below the five Super Draw tools' combined minimum. */}
        {mainTools.map(tool =>
          renderTool(tool, {minWidth: TOOLBAR_SIZE, flexGrow: 1, flexBasis: 0})
        )}
      </Flex>
      <Flex direction="row" gapX="1" style={{flexGrow: historyTools.length * HISTORY_GROW_FACTOR}}>
        {historyTools.map(tool =>
          renderTool(tool, {minWidth: HISTORY_BUTTON_WIDTH, flexGrow: 1, flexBasis: 0})
        )}
      </Flex>
    </Flex>
  );
};
