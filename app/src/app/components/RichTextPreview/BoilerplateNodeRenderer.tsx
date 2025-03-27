import { Flex } from '@radix-ui/themes';
import React from 'react';
import { boilerplateContent } from '../Cms/RichTextEditor/extensions/BoilerplateContent';

interface BoilerplateNodeRendererProps {
  customText: string;
}

const BoilerplateNodeRenderer: React.FC<BoilerplateNodeRendererProps> = ({ customText }) => {
  return (
    <Flex direction={"column"} gapY="2">
      {boilerplateContent.AboutTheDataBoilerplate}
      {customText && (
        <div className="custom-text mt-3 pt-3 border-t border-gray-300">
          <p>{customText}</p>
        </div>
      )}
    </Flex>
  );
};

export default BoilerplateNodeRenderer;