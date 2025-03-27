'use client';
import React from 'react';
import {EditorContent} from '@tiptap/react';
import {Box, Flex, Button, IconButton, Text} from '@radix-ui/themes';
import {useCmsEditorConfig} from '@/app/hooks/useCmsEditorConfig';

interface RichTextEditorProps {
  content: string | object;
  onChange: (json: object) => void;
  placeholder?: string;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  content,
  onChange,
  placeholder = 'Start writing...',
}) => {
  const {editor, fontButtonConfigs, headingButtonConfigs, listButtonConfigs, mediaButtonConfigs} =
    useCmsEditorConfig(content, onChange);
  if (!editor) {
    return null;
  }

  return (
    <Box className="border border-gray-300 rounded-md overflow-hidden">
      <Flex gap="1" p="2" wrap="wrap" className="bg-gray-50 border-b border-gray-300">
        <Flex direction="row" gapX="3" pr="2" className="border-r-[1px] border-gray-400">
          {fontButtonConfigs.map((Config, index) => (
            <IconButton
              key={index}
              variant="ghost"
              className={Config.active() ? '!bg-gray-200' : ''}
              color="gray"
              title={Config.title}
              onClick={Config.onClick}
            >
              <Config.icon width="24" height="24" />
            </IconButton>
          ))}
        </Flex>
        <Flex
          direction="row"
          gapX="3"
          px="2"
          pr="3"
          className="border-r-[1px] border-gray-400"
          align="center"
        >
          {headingButtonConfigs.map((Config, index) => (
            <Button
              key={index}
              variant="ghost"
              className={Config.active() ? '!bg-gray-200 p-2' : 'p-2'}
              color="gray"
              title={Config.title}
              onClick={Config.onClick}
            >
              <Text>H{index + 1}</Text>
            </Button>
          ))}
        </Flex>

        <Flex
          direction="row"
          gapX="3"
          px="2"
          className="border-r-[1px] border-gray-400"
          align="center"
        >
          {listButtonConfigs.map((Config, index) => (
            <IconButton
              key={index}
              variant="ghost"
              className={Config.active() ? '!bg-gray-200' : ''}
              color="gray"
              title={Config.title}
              onClick={Config.onClick}
            >
              <Config.icon width="24" height="24" />
            </IconButton>
          ))}
        </Flex>

        <Flex direction="row" gapX="3" px="2">
          {mediaButtonConfigs.map((Config, index) => (
            <IconButton
              key={index}
              variant="ghost"
              className={Config.active() ? '!bg-gray-200' : ''}
              color="gray"
              title={Config.title}
              onClick={Config.onClick}
            >
              <Config.icon width="24" height="24" />
            </IconButton>
          ))}
        </Flex>
      </Flex>

      <Box p="4">
        <EditorContent editor={editor} className="min-h-[200px]" />
        {!editor.getText() && (
          <Box
            position={'absolute'}
            top="32"
            left="8"
            className="text-gray-400 pointer-events-none"
          >
            {placeholder}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default RichTextEditor;
