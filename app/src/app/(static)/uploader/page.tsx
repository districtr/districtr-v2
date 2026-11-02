'use client';
import React from 'react';
import {Uploader} from '@/app/components/Uploader/Uploader';
import {Box, Flex, Heading, Text} from '@radix-ui/themes';

export default function UploaderPage() {
  return (
    <Flex direction="column" gapY="4" pt="4" className="max-w-2xl w-full mx-auto">
      <Box>
        <Heading as="h1" size="8">
          Upload block assignments
        </Heading>
        <Text size="3" color="gray">
          Each CSV becomes its own map. Links open in a new tab.
        </Text>
      </Box>
      <Uploader newTab={true} />
    </Flex>
  );
}
