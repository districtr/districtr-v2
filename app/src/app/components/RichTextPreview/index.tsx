'use client';

import React from 'react';
import {generateHTML} from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';

interface RichTextPreviewProps {
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
];

const RichTextPreview: React.FC<RichTextPreviewProps> = ({content, className = ''}) => {
  // Convert to HTML if it's a JSON object
  const htmlContent = typeof content === 'string' ? content : generateHTML(content, extensions);

  return (
    <div
      className={`prose prose-sm max-w-none ${className}`}
      dangerouslySetInnerHTML={{__html: htmlContent}}
    />
  );
};

export default RichTextPreview;
