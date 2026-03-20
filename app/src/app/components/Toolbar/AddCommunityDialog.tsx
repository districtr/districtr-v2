import React, {useEffect, useState} from 'react';
import {CheckIcon, ChevronDownIcon} from '@radix-ui/react-icons';
import {
  Box,
  Button,
  Dialog,
  Flex,
  Popover,
  Tabs,
  Text,
  TextArea,
  TextField,
} from '@radix-ui/themes';
import {ChromePicker, type ColorResult} from 'react-color';

import {DEFAULT_COMMUNITY_DESCRIPTION} from '@/app/utils/communities';

type ColorTab = 'palette' | 'custom';

type AddCommunityDialogProps = {
  availableColors: string[];
  defaultColor: string;
  defaultDescription?: string;
  defaultName: string;
  mode?: 'add' | 'edit';
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: {name: string; description: string; color: string}) => void;
  open: boolean;
};

export const AddCommunityDialog: React.FC<AddCommunityDialogProps> = ({
  availableColors,
  defaultColor,
  defaultDescription = DEFAULT_COMMUNITY_DESCRIPTION,
  defaultName,
  mode = 'add',
  onOpenChange,
  onSubmit,
  open,
}) => {
  const [communityName, setCommunityName] = useState(defaultName);
  const [communityDescription, setCommunityDescription] = useState(defaultDescription);
  const [selectedColor, setSelectedColor] = useState(defaultColor);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [colorTab, setColorTab] = useState<ColorTab>('palette');
  const suggestedColors = Array.from(new Set([defaultColor, ...availableColors])).slice(0, 24);
  const dialogTitle = mode === 'edit' ? 'Edit Community' : 'Add Community';
  const submitLabel = mode === 'edit' ? 'Save Changes' : 'Add Community';

  useEffect(() => {
    if (!open) return;
    setCommunityName(defaultName);
    setCommunityDescription(defaultDescription);
    setSelectedColor(defaultColor);
    setColorMenuOpen(false);
    setColorTab('palette');
  }, [availableColors, defaultColor, defaultDescription, defaultName, open]);

  const handleCustomColorChange = (color: ColorResult) => {
    setSelectedColor(color.hex);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content style={{maxWidth: 500}}>
        <Dialog.Title>{dialogTitle}</Dialog.Title>
        <form
          onSubmit={event => {
            event.preventDefault();
            onSubmit({
              name: communityName,
              description: communityDescription,
              color: selectedColor,
            });
          }}
        >
          <Flex direction="column" gap="3">
            <label>
              <Text as="div" size="2" mb="1" weight="medium">
                Community Name
              </Text>
              <TextField.Root
                value={communityName}
                onChange={event => setCommunityName(event.target.value)}
                placeholder={defaultName}
                autoFocus
              />
            </label>
            <label>
              <Text as="div" size="2" mb="1" weight="medium">
                Comment
              </Text>
              <TextArea
                value={communityDescription}
                onChange={event => setCommunityDescription(event.target.value)}
                placeholder={defaultDescription}
                rows={4}
              />
            </label>
            <Flex direction="column" gap="2">
              <Text as="div" size="2" weight="medium">
                Community Color
              </Text>
              <Popover.Root open={colorMenuOpen} modal>
                <Popover.Trigger>
                  <Button
                    type="button"
                    variant="soft"
                    color="gray"
                    style={{justifyContent: 'space-between', width: '100%'}}
                    onClick={() => setColorMenuOpen(open => !open)}
                  >
                    <Flex align="center" gap="2">
                      <Box
                        className="h-4 w-4 rounded border border-gray-300"
                        style={{backgroundColor: selectedColor}}
                      />
                      <Text size="2">Community color</Text>
                    </Flex>
                    <Flex align="center" gap="2">
                      <Text size="1" color="gray">
                        {selectedColor}
                      </Text>
                      <ChevronDownIcon />
                    </Flex>
                  </Button>
                </Popover.Trigger>
                <Popover.Content
                  side="top"
                  sideOffset={8}
                  align="start"
                  style={{width: 320, zIndex: 1000}}
                  onPointerDownOutside={() => setColorMenuOpen(false)}
                  onEscapeKeyDown={() => setColorMenuOpen(false)}
                >
                  <Tabs.Root
                    value={colorTab}
                    onValueChange={value => setColorTab(value as ColorTab)}
                  >
                    <Tabs.Content value="palette">
                      <Flex wrap="wrap" gap="2">
                        {suggestedColors.map(color => {
                          const isSelected = color.toLowerCase() === selectedColor.toLowerCase();
                          return (
                            <button
                              key={color}
                              type="button"
                              aria-label={`Select color ${color}`}
                              className={`flex h-7 w-7 items-center justify-center rounded-full border transition-transform hover:scale-105 ${
                                isSelected ? 'border-black shadow-sm' : 'border-gray-300'
                              }`}
                              style={{backgroundColor: color}}
                              onClick={() => setSelectedColor(color)}
                            >
                              {isSelected && <CheckIcon className="text-white drop-shadow" />}
                            </button>
                          );
                        })}
                      </Flex>
                    </Tabs.Content>
                    <Tabs.Content value="custom">
                      <Flex justify="center">
                        <ChromePicker
                          color={selectedColor}
                          onChange={handleCustomColorChange}
                          disableAlpha
                        />
                      </Flex>
                    </Tabs.Content>
                    <Tabs.List mt="3" justify="center">
                      <Tabs.Trigger value="palette">Palette</Tabs.Trigger>
                      <Tabs.Trigger value="custom">Custom</Tabs.Trigger>
                    </Tabs.List>
                  </Tabs.Root>
                </Popover.Content>
              </Popover.Root>
            </Flex>
            <Flex justify="end" gap="2">
              <Button variant="soft" color="gray" type="button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">{submitLabel}</Button>
            </Flex>
          </Flex>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
};
