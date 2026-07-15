'use client';
import React, {useState} from 'react';
import {Box, Button, Flex, Heading, Text} from '@radix-ui/themes';
import {UploadIcon} from '@radix-ui/react-icons';
import {ResponsivePlaceMap} from '@/app/components/Static/PlaceMap/PlaceMap';
import {UploaderModal} from '@/app/components/Toolbar/UploaderModal';

export default function DrawPage() {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <Flex direction="column" gapY="4" pt="4">
      <Flex direction="row" justify="between" align="start" wrap="wrap" gapY="2">
        <Box>
          <Heading as="h1" size="8">
            Draw a map
          </Heading>
          <Text size="3" color="gray">
            Choose a state to start drawing, or upload an existing block-assignment file.
          </Text>
        </Box>
        <Button onClick={() => setUploadOpen(true)} variant="soft">
          <UploadIcon /> Upload block assignments
        </Button>
      </Flex>

      <ResponsivePlaceMap />

      <UploaderModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </Flex>
  );
}
