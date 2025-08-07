'use client';
import {useEffect} from 'react';
import {useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import BoilerplateNode from '../components/Cms/RichTextEditor/extensions/Boierplate/BoilerplateNode';
import {
  FontBoldIcon,
  FontItalicIcon,
  ImageIcon,
  Link2Icon,
  ListBulletIcon,
  QuoteIcon,
  StrikethroughIcon,
  UnderlineIcon,
  InfoCircledIcon,
  HeadingIcon,
  FileTextIcon,
} from '@radix-ui/react-icons';
import SectionHeaderNode from '../components/Cms/RichTextEditor/extensions/SectionHeader/SectionHeaderNode';
import FormNode from '../components/Cms/RichTextEditor/extensions/CommentSubmissionForm/FormNode';

export const useCmsEditorConfig = (content: string | object, onChange: (json: object) => void) => {
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
      Image.configure({
        allowBase64: true,
      }),
      BoilerplateNode,
      SectionHeaderNode,
      FormNode,
    ],
    content: typeof content === 'string' ? content : content,
    onUpdate: ({editor}) => {
      // Get JSON instead of HTML
      const json = editor.getJSON();
      onChange(json);
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none min-h-[200px] max-w-none',
      },
    },
  });

  useEffect(() => {
    if (editor) {
      const currentContent = editor.getJSON();
      const isContentDifferent =
        typeof content === 'string'
          ? content !== editor.getHTML()
          : JSON.stringify(content) !== JSON.stringify(currentContent);

      if (isContentDifferent) {
        editor.commands.setContent(content);
      }
    }
  }, [content, editor]);

  if (!editor) {
    return {};
  }

  const fontButtonConfigs = [
    {
      title: 'Bold',
      icon: FontBoldIcon,
      onClick: () => editor.chain().focus().toggleBold().run(),
      active: () => editor.isActive('bold'),
    },
    {
      title: 'Italic',
      icon: FontItalicIcon,
      onClick: () => editor.chain().focus().toggleItalic().run(),
      active: () => editor.isActive('italic'),
    },
    {
      title: 'Underline',
      icon: UnderlineIcon,
      onClick: () => editor.chain().focus().toggleUnderline().run(),
      active: () => editor.isActive('underline'),
    },
    {
      title: 'Strikethrough',
      icon: StrikethroughIcon,
      onClick: () => editor.chain().focus().toggleStrike().run(),
      active: () => editor.isActive('strike'),
    },
  ];

  const headingButtonConfigs = [
    {
      title: 'Heading 1',
      onClick: () => editor.chain().focus().setHeading({level: 1}).run(),
      active: () => editor.isActive('heading', {level: 1}),
    },
    {
      title: 'Heading 2',
      onClick: () => editor.chain().focus().setHeading({level: 2}).run(),
      active: () => editor.isActive('heading', {level: 2}),
    },
    {
      title: 'Heading 3',
      onClick: () => editor.chain().focus().setHeading({level: 3}).run(),
      active: () => editor.isActive('heading', {level: 3}),
    },
  ];

  const listButtonConfigs = [
    {
      title: 'Unordered List',
      icon: ListBulletIcon,
      onClick: () => editor.chain().focus().toggleBulletList().run(),
      active: () => editor.isActive('bulletList'),
    },
    {
      title: 'Ordered List',
      icon: () => (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
        >
          <line x1="10" y1="6" x2="21" y2="6"></line>
          <line x1="10" y1="12" x2="21" y2="12"></line>
          <line x1="10" y1="18" x2="21" y2="18"></line>
          <path d="M4 6h1v4"></path>
          <path d="M4 10h2"></path>
          <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"></path>
        </svg>
      ),
      onClick: () => editor.chain().focus().toggleOrderedList().run(),
      active: () => editor.isActive('orderedList'),
    },
    {
      title: 'Blockquote',
      icon: QuoteIcon,
      onClick: () => editor.chain().focus().toggleBlockquote().run(),
      active: () => editor.isActive('blockquote'),
    },
  ];

  const mediaButtonConfigs = [
    {
      title: 'Add Link',
      icon: Link2Icon,
      onClick: () => {
        const url = window.prompt('Enter the URL');
        if (url) {
          editor.chain().focus().extendMarkRange('link').setLink({href: url}).run();
        }
      },
      active: () => editor.isActive('link'),
    },
    {
      title: 'Insert Image',
      icon: ImageIcon,
      onClick: () => {
        const url = window.prompt('Enter the URL');
        if (url) {
          editor.chain().focus().setImage({src: url}).run();
        }
      },
      active: () => editor.isActive('image'),
    },
  ];

  const customConfigs = [
    {
      title: 'Insert Data Explainer',
      icon: InfoCircledIcon,
      onClick: () => {
        // Insert a boilerplate node with empty content that can be edited in place
        editor.chain().focus().setBoilerplate().run();
      },
      active: () => editor.isActive('boilerplateNode'),
    },
    {
      title: 'Insert Section Header',
      icon: HeadingIcon,
      onClick: () => {
        editor.chain().focus().setSectionHeader().run();
      },
      active: () => editor.isActive('sectionHeaderNode'),
    },
    {
      title: 'Insert Comment Submission Form',
      icon: FileTextIcon,
      onClick: () => {
        editor.chain().focus().setForm().run();
      },
      active: () => editor.isActive('formNode'),
    },
  ];

  return {
    editor,
    fontButtonConfigs,
    listButtonConfigs,
    headingButtonConfigs,
    mediaButtonConfigs,
    customConfigs,
  };
};
