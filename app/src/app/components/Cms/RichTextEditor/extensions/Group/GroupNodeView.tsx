'use client';
import {NodeViewProps, NodeViewWrapper} from '@tiptap/react';
import {useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import React, {useEffect, useState} from 'react';
import {
  Box,
  Button,
  Dialog,
  Flex,
  Heading,
  Text,
  Select,
  TextField,
  Checkbox,
} from '@radix-ui/themes';
import RichTextEditor from '../../RichTextEditor';
import { getGroupList } from '@/app/utils/api/apiHandlers/getGroupList';

interface Group {
  slug: string;
  name: string;
}

const GroupNodeView: React.FC<NodeViewProps> = ({node, updateAttributes, deleteNode}) => {
  // Use a nested editor for the custom content
  const customContent = node.attrs.customContent || null;
  const groupSlugs = node.attrs.groupSlugs || [];
  const [dialogOpen, setDialogOpen] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>(groupSlugs || []);

  // Fetch available groups when component mounts
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        // Mock data for now - this would be replaced with an actual API call
        getGroupList().then(groups => {
          setAvailableGroups(groups);
        });
      } catch (error) {
        console.error('Error fetching groups:', error);
      }
    };

    fetchGroups();
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-500 underline',
        },
      }),
    ],
    content: customContent,
    onUpdate: ({editor}) => {
      updateAttributes({customContent: editor.getJSON()});
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm focus:outline-none w-full min-h-[100px] p-2',
      },
    },
  });

  // Set content when node attributes change from external source
  useEffect(() => {
    if (
      editor &&
      customContent &&
      JSON.stringify(editor.getJSON()) !== JSON.stringify(customContent)
    ) {
      editor.commands.setContent(customContent);
    }
  }, [customContent, editor]);

  // Update selectedGroups when groupSlugs changes
  useEffect(() => {
    setSelectedGroups(groupSlugs || []);
  }, [groupSlugs]);

  const handleGroupSelection = (slug: string) => {
    const newSelectedGroups = selectedGroups.includes(slug)
      ? selectedGroups.filter(s => s !== slug)
      : [...selectedGroups, slug];
    
    setSelectedGroups(newSelectedGroups);
    updateAttributes({groupSlugs: newSelectedGroups});
  };

  return (
    <NodeViewWrapper className="group-node border border-gray-300 rounded-md p-4 my-4 bg-gray-50">
      <Flex direction="row" justify="between" align="center" className="mb-4">
        <Box className="mb-4">Group Gallery</Box>
        <Button variant="ghost" onClick={deleteNode}>
          Delete
        </Button>
      </Flex>

      <Flex direction="column" gap="3">
        <Heading size="2">Selected Groups:</Heading>
        <Flex wrap="wrap" gap="2">
          {selectedGroups.length > 0 ? (
            selectedGroups.map(slug => {
              const group = availableGroups.find(g => g.slug === slug);
              return (
                <Box key={slug} className="px-3 py-1 bg-blue-100 rounded-full">
                  {group?.name || slug}
                </Box>
              );
            })
          ) : (
            <Text color="gray">No groups selected</Text>
          )}
        </Flex>
      </Flex>

      {editor && (
        <Dialog.Root open={dialogOpen}>
          <Dialog.Trigger>
            <Button className="p-2 mt-4 !cursor-pointer" onClick={() => setDialogOpen(true)}>
              Edit Group Content
            </Button>
          </Dialog.Trigger>
          <Dialog.Content>
            <Flex direction="column" gapY="4">
              <Heading as="h4">Editing Group Content</Heading>

              <Box className="my-4">
                <Heading size="3" className="mb-2">Select Groups</Heading>
                <Flex direction="column" gap="2">
                  {availableGroups.map(group => (
                    <Flex key={group.slug} align="center" gap="2">
                      <Checkbox 
                        checked={selectedGroups.includes(group.slug)}
                        onCheckedChange={() => handleGroupSelection(group.slug)}
                      />
                      <Text>{group.name}</Text>
                    </Flex>
                  ))}
                </Flex>
              </Box>

              <Heading size="3" className="mb-2">Custom Content</Heading>
              <RichTextEditor
                onChange={json => {
                  editor.commands.setContent(json);
                }}
                content={customContent}
                placeholder=""
                showCustomRenderers={false}
              />
              <Flex direction="row" align="center" justify="end" gap="4">
                <Button
                  variant="outline"
                  onClick={() => {
                    updateAttributes({
                      customContent: editor.getJSON(),
                      groupSlugs: selectedGroups
                    });
                    setDialogOpen(false);
                  }}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  color="red"
                  onClick={() => {
                    setDialogOpen(false);
                  }}
                >
                  Cancel
                </Button>
              </Flex>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      )}
    </NodeViewWrapper>
  );
};

export default GroupNodeView;