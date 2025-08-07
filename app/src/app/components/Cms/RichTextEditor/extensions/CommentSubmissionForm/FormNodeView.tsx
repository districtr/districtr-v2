'use client';
import {NodeViewProps, NodeViewWrapper} from '@tiptap/react';
import React, { useEffect, useState } from 'react';
import {Box, Button, Dialog, Flex, IconButton, Text} from '@radix-ui/themes';
import {GearIcon, TrashIcon} from '@radix-ui/react-icons';
import {CommentSubmissionForm} from '@/app/components/Forms/CommentSubmissionForm';
import { TagSelector } from '@/app/components/Forms/TagSelector';
import { getAvailableDistrictrMaps } from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import { DistrictrMap } from '@/app/utils/api/apiHandlers/types';
import { ListSelector } from '@/app/components/Forms/ListSelector';

const FormNodeView: React.FC<NodeViewProps> = ({node, updateAttributes, deleteNode}) => {
  const mandatoryTags = node.attrs.mandatoryTags as string[];
  const allowListModules = node.attrs.allowListModules as string[];

  const [tagInput, setTagInput] = useState('');
  const handleTagChange = (tag: string, action: 'add' | 'remove') => {
    const newTags = action === 'add' ? [...mandatoryTags, tag] : mandatoryTags.filter(t => t !== tag);
    updateAttributes({
      mandatoryTags: newTags,
    });
    setTagInput('');
  };
  const handleKeyInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();   
      handleTagChange(tagInput, 'add');
    }
  };

  const [mapModules, setMapModules] = useState<DistrictrMap[]>([]);
  useEffect(() => {
    const loadMapModules = async () => {
      const modules = await getAvailableDistrictrMaps({
        limit: 1000,
        offset: 0,
      });
      setMapModules(modules);
    };
    loadMapModules();
  }, [setMapModules]);
  
  const handleAllowListModulesChange = (module: string, action: 'add' | 'remove') => {
    const newModules = action === 'add' ? [...allowListModules, module] : allowListModules.filter(m => m !== module);
    updateAttributes({
      allowListModules: newModules,
    });
  };

  return (
    <NodeViewWrapper className="relative border-[1px] border-gray-200 rounded-md p-4 border-dashed">
      <CommentSubmissionForm
        mandatoryTags={node.attrs.mandatoryTags}
        allowListModules={node.attrs.allowListModules}
      />
      <Box position="absolute" top="0" right="-1rem">
        <Dialog.Root>
          <Dialog.Trigger>
            <IconButton variant="ghost" size="1">
              <GearIcon />
            </IconButton>
          </Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Title>Edit Comment Submission Form</Dialog.Title>
            <Dialog.Description>
              <Flex direction="column" gap="2">
                <Text>Event tags (mandatory tag/s inlcuded in every form submission)</Text>
                <TagSelector
                  tagInput={tagInput}
                  setTagInput={setTagInput}
                  fixedTags={[]}
                  tags={mandatoryTags}
                  handleChange={handleTagChange}
                  handleKeyInput={handleKeyInput}
                />
              </Flex>
              <Flex direction="column" gap="2" mt="2">
                <Text>Allow list modules (modules that are allowed to be selected in the form)</Text>
                <ListSelector<DistrictrMap>
                  value={allowListModules}
                  entries={mapModules}
                  keyProperty="districtr_map_slug"
                  SelectComponent={({name, districtr_map_slug, num_districts}) => <Flex direction="column" gap="1">
                    <Text>{name}</Text>
                    <Text size="1" color="gray">{districtr_map_slug}</Text>
                    <Text size="1" color="gray">{num_districts} districts</Text>
                  </Flex>}
                  handleChange={handleAllowListModulesChange}
                />
              </Flex>
            </Dialog.Description>
            <Dialog.Close>
              <Button variant="soft" color="gray">Close</Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Root>
        <IconButton variant="ghost" size="1" onClick={deleteNode}>
          <TrashIcon />
        </IconButton>
      </Box>
    </NodeViewWrapper>
  );
};

export default FormNodeView;
