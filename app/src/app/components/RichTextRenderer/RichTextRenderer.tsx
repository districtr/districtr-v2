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
import { domNodeReplacers } from './CustomRenderers/DomNodeRenderers';

interface RichTextRendererProps {
  content: string | object;
  className?: string;
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
];

const RichTextRenderer: React.FC<RichTextRendererProps> = ({content, className = ''}) => {
  const htmlContent = typeof content === 'string' ? content : generateHTML(content, extensions);

  const reactContent = parse(htmlContent, {
    replace: domNodeReplacers
  });

  return (
    <div className={`prose prose-sm max-w-none ${className}`}>
      {reactContent}
    </div>
  );
};

export default RichTextRenderer;