'use client';
import React, {useEffect, useState} from 'react';
import {Button, Popover} from '@radix-ui/themes';
import {CaretDownIcon, MixerHorizontalIcon} from '@radix-ui/react-icons';
import {ToolSettings} from './Settings';
import {useUiHintStore} from '@store/uiHintStore';

/** Visual settings as a compact popover button — lives beside the toolbar in
 * the desktop sidebar and in the mobile dock. */
export const VisualSettingsPopover: React.FC = () => {
  const [open, setOpen] = useState(false);
  // Improve-your-plan hints ping this to show the user where a setting they
  // just enabled actually lives.
  const visualSettingsOpenAt = useUiHintStore(state => state.visualSettingsOpenAt);
  useEffect(() => {
    if (visualSettingsOpenAt) setOpen(true);
  }, [visualSettingsOpenAt]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
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
  );
};
