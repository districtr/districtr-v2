'use client';

import React from 'react';
import {Box, Callout, Flex, Heading, Text} from '@radix-ui/themes';
import {ExclamationTriangleIcon} from '@radix-ui/react-icons';
import {RecentMapsList} from '@/app/components/RecentMapsList';

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

export const ManageMapsPage: React.FC = () => {
  const isSafari = React.useMemo(
    () => typeof navigator !== 'undefined' && isSafariBrowser(navigator.userAgent),
    []
  );

  return (
    <Flex direction="column" gap="5">
      <Box>
        <Heading size="7" as="h1">
          My Maps
        </Heading>
        <Text size="3" color="gray">
          Browse and manage maps saved in this browser.
        </Text>
      </Box>

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

      <RecentMapsList showFilters useScrollArea={false} pageSize={10} />
    </Flex>
  );
};
