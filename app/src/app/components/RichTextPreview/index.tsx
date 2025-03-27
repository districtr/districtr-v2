'use client';

import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {generateHTML} from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import BoilerplateNode from '../Cms/RichTextEditor/extensions/BoilerplateNode';
import BoilerplateNodeRenderer from './BoilerplateNodeRenderer';

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
  BoilerplateNode,
];

const RichTextPreview: React.FC<RichTextPreviewProps> = ({content, className = ''}) => {
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [htmlContent, setHtmlContent] = useState<string>('');
  
  // Generate HTML from content
  useEffect(() => {
    const html = typeof content === 'string' ? content : generateHTML(content, extensions);
    setHtmlContent(html);
  }, [content]);
  
  // Process boilerplate nodes after rendering
  useEffect(() => {
    if (!contentRef.current || typeof window === 'undefined') return;
    
    // Find all boilerplate nodes in the rendered content
    const boilerplateNodes = contentRef.current.querySelectorAll('div[data-type="boilerplate-node"]');
    
    // Replace each node with our custom component
    boilerplateNodes.forEach((node) => {
      // Try to get content from new attribute structure first
      let customContent = null;
      const contentStr = node.getAttribute('data-custom-content');
      
      if (contentStr) {
        try {
          customContent = JSON.parse(contentStr);
        } catch (error) {
          console.error('Error parsing boilerplate custom content:', error);
        }
      } else {
        // Fallback to old attribute structure
        const oldCustomText = node.getAttribute('data-custom-text');
        if (oldCustomText) {
          customContent = oldCustomText;
        }
      }
      
      // Create a container for our React component
      const container = document.createElement('div');
      node.parentNode?.replaceChild(container, node);
      
      // Render our custom component in place of the node
      const root = ReactDOM.createRoot(container);
      root.render(<BoilerplateNodeRenderer customContent={customContent} />);
    });
  }, [htmlContent]);
  
  return (
    <div className={`prose prose-sm max-w-none ${className}`} ref={contentRef}>
      <div dangerouslySetInnerHTML={{__html: htmlContent}} />
    </div>
  );
};

export default RichTextPreview;
