'use client';
import {NodeViewProps, NodeViewWrapper} from '@tiptap/react';
import React, {useRef} from 'react';
import {Box, Button, Dialog, Flex, Heading, Select, Text} from '@radix-ui/themes';
import {MapCreateButtons, MapCreateButtonsProps} from './MapCreateButtons';
import {GearIcon, TrashIcon} from '@radix-ui/react-icons';
import {NoFocusBoundary} from '../NoFocusBoundary';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {ListSelector} from '@/app/components/Forms/ListSelector';
import {useMapModules} from '@/app/hooks/useMapModules';

const MapCreateButtonsNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  // Use a nested editor for the custom content
  const views: Array<Pick<DistrictrMap, 'name' | 'districtr_map_slug'>> = node.attrs.views || [];
  const type: 'simple' | 'megaphone' = node.attrs.type || 'simple';

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const handleUpdate = (updates: Partial<MapCreateButtonsProps>) => {
    const newAttrs = {
      ...node.attrs,
      ...updates,
    };
    updateAttributes(newAttrs);
  };

  const mapModules = useMapModules();

  return (
    <NodeViewWrapper className="relative" ref={parentRef} contentEditable={false}>
      <NoFocusBoundary parentRef={parentRef}>
        <MapCreateButtons views={views} type={type} />
      </NoFocusBoundary>
      <Box position="absolute" top="2" right="2">
        <Flex direction="column" gap="2">
          <Dialog.Root open={dialogOpen}>
            <Dialog.Trigger>
              <Button className="p-2 !cursor-pointer" onClick={() => setDialogOpen(true)}>
                <GearIcon />
              </Button>
            </Dialog.Trigger>
            <Dialog.Content>
              <Flex direction="column" gapY="4">
                <Heading as="h4">Editing Map Create Buttons</Heading>
                <Flex direction="column" gap="2">
                  <Text>Map Modules</Text>

                  <ListSelector<DistrictrMap>
                    value={views.map(view => view.districtr_map_slug)}
                    entries={mapModules}
                    keyProperty="districtr_map_slug"
                    SelectComponent={({name, districtr_map_slug}) => (
                      <Flex direction="column" gap="1">
                        <Text>{name}</Text>
                        <Text size="1" color="gray">
                          {districtr_map_slug}
                        </Text>
                      </Flex>
                    )}
                    handleChange={(item, action) => {
                      const entry: DistrictrMap | undefined = mapModules.find(
                        module => module.districtr_map_slug === item
                      );
                      if (action === 'add' && entry) {
                        handleUpdate({
                          views: [
                            ...views,
                            {name: entry.name, districtr_map_slug: entry.districtr_map_slug},
                          ],
                        });
                      } else {
                        handleUpdate({
                          views: views.filter(view => view.districtr_map_slug !== item),
                        });
                      }
                    }}
                  />
                </Flex>
                <Flex direction="column" gap="2">
                  <Text>Type</Text>
                  <Select.Root
                    value={type}
                    onValueChange={value => handleUpdate({type: value as 'simple' | 'megaphone'})}
                  >
                    <Select.Trigger placeholder="Select a type" />
                    <Select.Content>
                      <Select.Item value="simple">Simple</Select.Item>
                      <Select.Item value="megaphone">Megaphone</Select.Item>
                    </Select.Content>
                  </Select.Root>
                </Flex>
                <Flex direction="row" gap="2">
                  <Button onClick={() => setDialogOpen(false)}>Close</Button>
                </Flex>
              </Flex>
            </Dialog.Content>
          </Dialog.Root>
          <Button onClick={deleteNode} color="red" variant="soft">
            <TrashIcon />
          </Button>
        </Flex>
      </Box>
    </NodeViewWrapper>
  );
};

export default MapCreateButtonsNodeView;
