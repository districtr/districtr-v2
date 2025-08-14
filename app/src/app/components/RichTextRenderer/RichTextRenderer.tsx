import React from 'react';
import {generateHTML} from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import BoilerplateNode from '../Cms/RichTextEditor/extensions/Boierplate/BoilerplateNode';
import parse from 'html-react-parser';
import {domNodeReplacers} from './CustomRenderers/DomNodeRenderers';
import SectionHeaderNode from '../Cms/RichTextEditor/extensions/SectionHeader/SectionHeaderNode';
import FormNode from '../Cms/RichTextEditor/extensions/CommentSubmissionForm/FormNode';

interface RichTextRendererProps {
  content: string | object;
  className?: string;
  disabled?: boolean;
}

const extensions = [
  StarterKit,
  Underline,
  TextStyle,
  Color,
  Link.configure({
    HTMLAttributes: {
      class: 'text-blue-500 underline',
    },
  }),
  Image,
  BoilerplateNode,
  SectionHeaderNode,
  FormNode,
];

const RichTextRenderer: React.FC<RichTextRendererProps> = ({
  content,
  disabled = false,
  className = '',
}) => {
  const htmlContent = typeof content === 'string' ? content : generateHTML(content, extensions);

  const reactContent = parse(htmlContent, {
    replace: domNodeReplacers(disabled),
  });

  return <div className={`prose prose-sm max-w-none ${className}`}>{reactContent}</div>;
};

export default RichTextRenderer;
