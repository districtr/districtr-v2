'use client';
import React, {useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Box, Button, Flex, Heading, Text} from '@radix-ui/themes';
import {UploadIcon} from '@radix-ui/react-icons';
import {ResponsivePlaceMap} from '@/app/components/Static/PlaceMap/PlaceMap';
import {UploaderModal} from '@/app/components/Toolbar/UploaderModal';

export default function DrawPage() {
  // ?upload=1 auto-opens the uploader — used by links (e.g. a place page's
  // "Upload block assignments") that want to land here with the prompt open,
  // since import doesn't depend on which state you started from.
  const searchParams = useSearchParams();
  const [uploadOpen, setUploadOpen] = useState(searchParams.get('upload') === '1');

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
