import {Heading} from '@radix-ui/themes';
import React from 'react';

export const ContentHeader: React.FC<{
  title: string;
}> = ({title}) => {
  return (
    <Heading as="h2" className="font-bold p-4 bg-gray-100" size="6">
      {title}
    </Heading>
  );
};
