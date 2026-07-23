'use client';
import React from 'react';
import {Button, Flex, Popover} from '@radix-ui/themes';
import {CaretDownIcon, MixerHorizontalIcon} from '@radix-ui/react-icons';
import {ToolSettings} from './Settings';
import {HelpTip} from '@components/InfoTip/HelpTip';

/** Visual settings as a compact popover button — lives beside the toolbar in
 * the desktop sidebar and in the mobile dock.
 *
 * The info icon sits directly against the button's trailing edge (rather than
 * literally inside the <button>) because HelpTip's trigger, and the link inside
 * its expanded content, are themselves interactive elements — nesting either
 * inside another <button> is invalid HTML. */
export const VisualSettingsPopover: React.FC = () => (
  <Flex align="center" gap="0">
    <Popover.Root>
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
    <HelpTip tip="visualSettings" />
  </Flex>
);
