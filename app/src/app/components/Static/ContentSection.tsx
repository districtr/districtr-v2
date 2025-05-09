import {Box, Flex, Heading} from '@radix-ui/themes';
import React from 'react';

export const ContentSection: React.FC<{
  title: string;
  children: React.ReactNode;
  flavorImage?: React.ReactNode;
}> = ({title, flavorImage, children}) => {
  return (
    <Box>
      <Flex direction="row" align="center" justify="start" my="2">
        <Heading as="h2" className="font-bold p-4 bg-gray-100" size="6">
          {title}
        </Heading>
        {!!flavorImage && flavorImage}
      </Flex>
      {children}
    </Box>
  );
};
