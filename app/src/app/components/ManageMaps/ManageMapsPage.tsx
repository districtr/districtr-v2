'use client';

import React, {useState} from 'react';
import {Box, Button, Callout, Flex, Heading, Text} from '@radix-ui/themes';
import {ExclamationTriangleIcon, UploadIcon} from '@radix-ui/react-icons';
import {RecentMapsList} from '@/app/components/RecentMapsList';
import {UploaderModal} from '@/app/components/Toolbar/UploaderModal';
import {MAP_TABS, MapTab} from '@constants/document/tabs';

const isSafariBrowser = (userAgent: string) => {
  return (
    /Safari\//.test(userAgent) &&
    !/Chrome\//.test(userAgent) &&
    !/CriOS\//.test(userAgent) &&
    !/FxiOS\//.test(userAgent) &&
    !/EdgiOS\//.test(userAgent) &&
    !/OPiOS\//.test(userAgent) &&
    !/Android/.test(userAgent)
  );
};

const TITLES: Record<MapTab, string> = {
  [MAP_TABS.DISTRICTS]: 'My District Plans',
  [MAP_TABS.COMMUNITY]: 'My Community Maps',
};

export const ManageMapsPage: React.FC<{mapType: MapTab}> = ({mapType}) => {
  const isSafari = React.useMemo(
    () => typeof navigator !== 'undefined' && isSafariBrowser(navigator.userAgent),
    []
  );
  const [importOpen, setImportOpen] = useState(false);

  return (
    <Flex direction="column" gap="5">
      <Flex direction="row" justify="between" align="start" wrap="wrap" gapY="2">
        <Box>
          <Heading size="7" as="h1">
            {TITLES[mapType]}
          </Heading>
          <Text size="3" color="gray">
            Browse and manage maps saved in this browser.
          </Text>
        </Box>
        {mapType === MAP_TABS.DISTRICTS && (
          <Button onClick={() => setImportOpen(true)} variant="soft">
            <UploadIcon /> Import block assignments
          </Button>
        )}
      </Flex>

      <Callout.Root color="amber" size="2">
        <Callout.Icon>
          <ExclamationTriangleIcon />
        </Callout.Icon>
        <Callout.Text>
          Saved maps on this page are local to this browser and device. Clearing browser cache or
          site data can permanently remove them.
        </Callout.Text>
      </Callout.Root>

      {isSafari && (
        <Callout.Root color="ruby" size="2">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            <b>Safari users:</b> if you do not use Districtr for 7 days, Safari may clear local data
            and your maps may be lost. We recommend using Chrome, Firefox, or Edge for better
            persistence.
          </Callout.Text>
        </Callout.Root>
      )}

      <RecentMapsList showFilters useScrollArea={false} pageSize={10} mapType={mapType} />

      <UploaderModal open={importOpen} onClose={() => setImportOpen(false)} />
    </Flex>
  );
};
