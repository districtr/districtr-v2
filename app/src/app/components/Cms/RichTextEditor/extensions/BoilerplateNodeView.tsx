'use client';
import {NodeViewProps, NodeViewWrapper} from '@tiptap/react';
import {EditorContent, useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import React, {useEffect} from 'react';
import {Box, Button, Dialog, Flex, Heading, Text} from '@radix-ui/themes';
import {boilerplateContent} from './BoilerplateContent';
import RichTextEditor from '../RichTextEditor';

const BoilerplateNodeView: React.FC<NodeViewProps> = ({node, updateAttributes, deleteNode}) => {
  // Use a nested editor for the custom content
  const customContent = node.attrs.customContent || null;
  const [dialogOpen, setDialogOpen] = React.useState(false);

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

  return (
    <NodeViewWrapper className="boilerplate-node border border-gray-300 rounded-md p-4 my-4 bg-gray-50">
      <Flex direction="row" justify="between" align="center" className="mb-4">
        <Box className="mb-4">About the data ...</Box>
        <Button variant="ghost" onClick={deleteNode}>
          Delete
        </Button>
      </Flex>
      {editor && (
        <Dialog.Root open={dialogOpen}>
          <Dialog.Trigger>
            <Button className="p-2 !cursor-pointer" onClick={() => setDialogOpen(true)}>
              Edit Custom Content
            </Button>
          </Dialog.Trigger>
          <Dialog.Content>
            <Flex direction="column" gapY="4">
              <Heading as="h4">Editing Custom Content: About the data</Heading>
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
                    updateAttributes({customContent: editor.getJSON()});
                    setDialogOpen(false);
                  }}
                >
                  Save
                </Button>
                <Button
                  variant="ghost"
                  color="red"
                  onClick={() => {
                    editor.commands.clearContent();
                    setDialogOpen(false);
                  }}
                >
                  Cancel edits
                </Button>
              </Flex>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      )}
    </NodeViewWrapper>
  );
};

export default BoilerplateNodeView;
