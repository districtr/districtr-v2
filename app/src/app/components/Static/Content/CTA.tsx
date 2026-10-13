'use client';
import React from 'react';
import {Box, Flex} from '@radix-ui/themes';
import {PlaceMapModal} from '../PlaceMap/PlaceMapModal';

export const CTA: React.FC = () => {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      className="relative w-full py-16 overflow-hidden bg-districtrLightBlue rounded-xl my-4"
    >
      <Box className="relative z-10 text-center max-w-2xl mx-auto px-4">
        <PlaceMapModal>
          <Box className="bg-districtrBlue text-white text-xl px-8 py-3 rounded-md font-bold hover:bg-blue-700 transition-colors cursor-pointer">
            Ready to start drawing districts?
          </Box>
        </PlaceMapModal>
      </Box>
    </Flex>
  );
};
