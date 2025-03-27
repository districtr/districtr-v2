import {FontBoldIcon} from '@radix-ui/react-icons';
import type {Editor} from '@tiptap/react';

const useCmsEditorConfig = (editor: Editor) => {
  const fontButtonConfigs = [
    {
      title: 'Bold',
      icon: FontBoldIcon,
      action: () => editor.chain().focus().toggleBold().run(),
    },
  ];
};
