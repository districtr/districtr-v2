'use client';
import React from 'react';
import Image from 'next/image';
import {Box, Flex, Text} from '@radix-ui/themes';
import {PlaceMapModal} from '../PlaceMap/PlaceMapModal';

export const CTA: React.FC = () => {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      className="relative w-full py-16 overflow-hidden bg-districtrLightBlue rounded-xl my-4"
    >
      <Box className="absolute inset-0 z-0 opacity-100 transform rotate-25 m-[-10%]">
        <Image
          src="/home-megaphone.png"
          alt="Megaphone background"
          fill
          style={{objectFit: 'contain'}}
        />
      </Box>

      <Box className="relative z-10 text-center max-w-2xl mx-auto px-4">
        <PlaceMapModal>
          <Box className="bg-districtrBlue text-white text-xl px-8 py-3 rounded-md font-bold hover:bg-blue-700 transition-colors cursor-pointer">
            Ready to start mapping your community?
          </Box>
        </PlaceMapModal>
      </Box>
    </Flex>
  );
};
