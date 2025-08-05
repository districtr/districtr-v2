import {Box, Flex} from '@radix-ui/themes';
import React from 'react';
import { ContentHeader } from './ContentHeader';

export const ContentSection: React.FC<{
  title: string;
  children: React.ReactNode;
  flavorImage?: React.ReactNode;
}> = ({title, flavorImage, children}) => {
  return (
    <Box>
      <Flex direction="row" align="center" justify="start" my="2">
        <ContentHeader title={title} />
        {!!flavorImage && flavorImage}
      </Flex>
      {children}
    </Box>
  );
};
