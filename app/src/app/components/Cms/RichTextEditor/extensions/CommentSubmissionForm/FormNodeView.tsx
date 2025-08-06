'use client';
import {NodeViewProps, NodeViewWrapper} from '@tiptap/react';
import React from 'react';
import {Box, Dialog, Flex, IconButton, Text} from '@radix-ui/themes';
import {GearIcon, TrashIcon} from '@radix-ui/react-icons';
import {CommentSubmissionForm} from '@/app/components/Forms/CommentSubmissionForm';

const FormNodeView: React.FC<NodeViewProps> = ({node, updateAttributes, deleteNode}) => {
  const mandatoryTags = node.attrs.mandatoryTags;
  const allowListModules = node.attrs.allowListModules;
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
              </Flex>
            </Dialog.Description>
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
