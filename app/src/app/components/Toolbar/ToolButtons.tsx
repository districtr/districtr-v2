'use client';
import {Flex, IconButton} from '@radix-ui/themes';
import {useMapControlsStore} from '@store/mapControlsStore';
import React from 'react';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {useActiveTools} from '@/app/components/Toolbar/ToolUtils';
import {HelpTip, HELP_TIP_HOVER_DELAY} from '@/app/components/HelpTip/HelpTip';

// Fixed button size; the old user-configurable size picker was removed.
const TOOLBAR_SIZE = 40;

export const ToolButtons: React.FC<{
  toolbarItemsRef: React.RefObject<HTMLDivElement>;
}> = ({toolbarItemsRef}) => {
  const activeTool = useMapControlsStore(state => state.activeTool);
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);
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
        const button = (
          <IconButton
            key={`${tool.mode}-flex`}
            data-testid={`${tool.mode}-tool`}
            className={`cursor-pointer ${i === 0 ? 'lg:rounded-l-lg' : ''} ${
              i === activeTools.length - 1 ? 'lg:rounded-r-lg' : ''
            } flex-grow`}
            onClick={() => {
              if (tool.onClick) {
                tool.onClick();
              } else {
                setActiveTool(activeTool === tool.mode ? ACTIVE_TOOLS.PAN : tool.mode);
              }
            }}
            style={{
              width: TOOLBAR_SIZE,
              height: TOOLBAR_SIZE,
            }}
            variant={tool.variant || activeTool === tool.mode ? 'solid' : 'surface'}
            color={tool.color}
            radius="none"
            disabled={tool.disabled}
          >
            {/* iconStyle (e.g. redo's mirror transform) applies to the icon only —
                on the button it would mirror the corner rounding too. */}
            <IconComponent
              width={TOOLBAR_SIZE * 0.4}
              height={TOOLBAR_SIZE * 0.4}
              style={tool.iconStyle}
            />
          </IconButton>
        );
        // HelpTip is the only hover overlay: a separate label/hotkey tooltip would
        // stack a second popup onto the same hover moment.
        return tool.helpKey ? (
          <HelpTip key={tool.mode} tip={tool.helpKey} openDelay={HELP_TIP_HOVER_DELAY}>
            {button}
          </HelpTip>
        ) : (
          button
        );
      })}
    </Flex>
  );
};
