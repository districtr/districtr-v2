'use client';
import React from 'react';
import {Button, Popover} from '@radix-ui/themes';
import {CaretDownIcon, MixerHorizontalIcon} from '@radix-ui/react-icons';
import {ToolSettings} from './Settings';
import {HelpTip, HELP_TIP_HOVER_DELAY} from '@components/HelpTip/HelpTip';

/** Visual settings as a compact popover button — lives beside the toolbar in
 * the desktop sidebar and in the mobile dock. Hovering the button itself (no
 * separate icon) shows the HelpTip.
 *
 * HelpTip wraps Popover.Trigger (not the reverse), and Popover.Content is a
 * sibling outside HelpTip's subtree — not nested inside it, even though it's
 * portaled to sit right below the button. React's synthetic pointer events
 * bubble along the *component* tree, not the portaled DOM tree, so a
 * Popover.Content nested inside HelpTip's own trigger would re-fire HelpTip's
 * pointerenter handler on every option hovered inside the open dropdown,
 * reopening the help card over the options list a second or two later. */
export const VisualSettingsPopover: React.FC = () => (
  <Popover.Root>
    <HelpTip tip="visualSettings" openDelay={HELP_TIP_HOVER_DELAY}>
      <Popover.Trigger>
        <Button
          variant="surface"
          color="gray"
          size="1"
          className="cursor-pointer transition-shadow hover:shadow-md"
          data-testid="visual-settings-trigger"
        >
          <MixerHorizontalIcon />
          Visual settings
          <CaretDownIcon />
        </Button>
      </Popover.Trigger>
    </HelpTip>
    <Popover.Content
      size="1"
      maxHeight="70vh"
      maxWidth="min(90vw, 320px)"
      align="start"
      className="overflow-y-auto"
    >
      <ToolSettings />
    </Popover.Content>
  </Popover.Root>
);
