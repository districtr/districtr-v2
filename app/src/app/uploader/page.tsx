'use client';
import React from 'react';
import {Uploader} from '../components/Uploader/Uploader';
import {Flex, Heading} from '@radix-ui/themes';

export default function UploaderPage() {
  return (
    <Flex direction="column" justify="center" align="center" className="w-screen h-screen">
      <Flex direction="column" gapY="4">
        <Heading size="3">Upload Block CSV</Heading>
        <Uploader newTab={true} />
      </Flex>
    </Flex>
  );
}
