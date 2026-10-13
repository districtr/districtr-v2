import {Box, Flex} from '@radix-ui/themes';
import React from 'react';
import {ContentHeader} from './ContentHeader';
import {slugify} from '@/app/utils/slugify';

export const ContentSection: React.FC<{
  title: string;
  children: React.ReactNode;
  flavorImage?: React.ReactNode;
}> = ({title, flavorImage, children}) => {
  return (
    <Box id={slugify(title)} className="scroll-mt-28">
      <Flex direction="row" align="center" justify="start" my="2">
        <ContentHeader title={title} />
        {!!flavorImage && flavorImage}
      </Flex>
      {children}
    </Box>
  );
};
