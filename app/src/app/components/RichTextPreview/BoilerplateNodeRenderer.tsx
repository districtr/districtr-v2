import { Flex } from '@radix-ui/themes';
import React from 'react';
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import { boilerplateContent } from '../Cms/RichTextEditor/extensions/BoilerplateContent';

interface BoilerplateNodeRendererProps {
  customContent?: object;
}

// Extensions for rendering the rich text content
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
];

const BoilerplateNodeRenderer: React.FC<BoilerplateNodeRendererProps> = ({ customContent }) => {
  // Generate HTML from the rich text JSON content
  const renderCustomContent = () => {
    if (!customContent) return null;
    
    try {
      // Check if customContent is already a string or if it's an object that needs to be converted to HTML
      const html = typeof customContent === 'string' 
        ? customContent 
        : generateHTML(customContent, extensions);
      
      return (
        <div 
          className="custom-content mt-3 pt-3 border-t border-gray-300 prose prose-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    } catch (error) {
      console.error('Error rendering rich text content:', error);
      return null;
    }
  };

  return (
    <Flex direction={"column"} gapY="2" className="boilerplate-container my-4 p-4 bg-gray-50 rounded-md border border-gray-200">
      {boilerplateContent.AboutTheDataBoilerplate}
      {renderCustomContent()}
    </Flex>
  );
};

export default BoilerplateNodeRenderer;