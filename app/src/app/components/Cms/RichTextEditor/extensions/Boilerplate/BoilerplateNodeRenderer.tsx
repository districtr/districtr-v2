import {Flex} from '@radix-ui/themes';
import React from 'react';
import {boilerplateContent} from './BoilerplateContent';

export interface BoilerplateNodeRendererProps {
  /** HTML string from the CMS StreamField boilerplate block */
  customContent?: string;
}

const BoilerplateNodeRenderer: React.FC<BoilerplateNodeRendererProps> = ({customContent}) => {
  return (
    <Flex
      direction={'column'}
      gapY="2"
      className="boilerplate-container my-4 p-4 bg-gray-50 rounded-md border border-gray-200"
    >
      {boilerplateContent.AboutTheDataBoilerplate}
      {!!customContent && (
        <div
          className="custom-content mt-3 pt-3 border-t border-gray-300 prose prose-sm"
          dangerouslySetInnerHTML={{__html: customContent}}
        />
      )}
    </Flex>
  );
};

export default BoilerplateNodeRenderer;
