import {Button, Text, DropdownMenu, Flex, Heading} from '@radix-ui/themes';
import React from 'react';
import {GerryDBViewSelector} from './sidebar/GerryDBViewSelector';
import {useMapStore} from '../store/mapStore';
import {RecentMapsModal} from './Toolbar/RecentMapsModal';
import {ToolSettings} from './Toolbar/Settings';

export const Topbar: React.FC = () => {
  const handleReset = useMapStore(state => state.handleReset);

  return (
    <Flex
      dir="row"
      className="border-b-2 border-gray-500 shadow-xl relative p-1"
      gap="4"
      align={'center'}
    >
      <Heading size="3">Districtr</Heading>

      <GerryDBViewSelector />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button variant="ghost" color="ruby">
            Reset Plan
            <DropdownMenu.TriggerIcon />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content className="max-w-[300px]">
          <Flex direction={'column'} gap="2" p="2">
            <Heading size="3">Reset Plan</Heading>
            <Text size="2">
              Are you sure? This will reset all zone assignments and broken geographies. Resetting
              your map cannot be undone.
            </Text>
            <Button variant="solid" color="red" onClick={handleReset}>
              Reset Plan
            </Button>
          </Flex>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <RecentMapsModal />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button variant="ghost">
            Settings
            <DropdownMenu.TriggerIcon />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content className="max-w-[300px]">
          <ToolSettings />
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </Flex>
  );
};
