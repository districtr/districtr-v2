import React from 'react';
import {Box, Flex, Heading, Link, Text} from '@radix-ui/themes';
import NextLink from 'next/link';

export const Footer: React.FC = () => (
  <Box className="p-4 bg-gray-200">
    <Flex
      direction={{
        initial: 'column',
        md: 'row',
      }}
      gap="2"
      justify={'between'}
      className="max-w-screen-lg mx-auto"
    >
      <Flex direction="column">
        <Heading as="h3" className="text-lg font-bold">
          Districtr
        </Heading>
        <NextLink href="/" legacyBehavior>
          <Link>Home</Link>
        </NextLink>
        <NextLink href="/tags" legacyBehavior>
          <Link>Tags</Link>
        </NextLink>
        <NextLink href="/places" legacyBehavior>
          <Link>Places</Link>
        </NextLink>
        <NextLink href="/about" legacyBehavior>
          <Link>About</Link>
        </NextLink>
        <NextLink href="/updates" legacyBehavior>
          <Link>What&apos;s new?</Link>
        </NextLink>
      </Flex>
      <Flex direction="column">
        <Heading as="h5">Admin</Heading>
        <NextLink href="/admin/cms" legacyBehavior>
          <Link>CMS</Link>
        </NextLink>
      </Flex>
    </Flex>
  </Box>
);
