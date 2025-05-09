import React from 'react';
import {Box, Flex, Grid, Heading, Link, Text} from '@radix-ui/themes';
import NextLink from 'next/link';
import Image from 'next/image';
import {PlaceMapModal} from './PlaceMap/PlaceMapModal';

export const Footer: React.FC = () => (
  <>
    <Box className="p-4 mt-12 pt-0 bg-gray-800">
      <Box id="footer-content" className="mx-auto max-w-screen-lg">
        <Box className="translate-y-[-50%]">
          <Box className="bg-gray-200 p-4 w-fit">
            <Image src="/districtr-splash-clear.png" alt="Districtr" width={100} height={100} />
          </Box>
        </Box>
        <NextLink href="/">
          <Heading as="h3" className="text-lg font-bold text-white cursor-pointer">
            Districtr
          </Heading>
        </NextLink>
        <Grid
          columns={{
            initial: '1',
            md: '2',
            lg: '4',
          }}
          gap="9"
        >
          <Flex direction="column" gapY="4">
            <Text className="text-white font-bold">
              <i>You</i> draw the lines.
            </Text>
            <Text className="text-white">
              Districtr is a free browser-based tool for drawing districts and mapping your
              community.
            </Text>
          </Flex>
          <Flex direction="column" className="text-white">
            <Text className="text-white font-bold mb-4" size="2">
              START DRAWING
            </Text>
            <NextLink href="/places" legacyBehavior className="">
              <Link className=" !cursor-pointer !text-districtrLightBlue">Places</Link>
            </NextLink>
            <NextLink href="/tags" legacyBehavior>
              <Link className=" !cursor-pointer !text-districtrLightBlue">Tags</Link>
            </NextLink>
            <PlaceMapModal>
              <Link className=" !cursor-pointer !text-districtrLightBlue">Explore maps</Link>
            </PlaceMapModal>
          </Flex>
          <Flex direction="column" className="text-white">
            <Text className="text-white font-bold mb-4" size="2">
              LEARN MORE
            </Text>

            <NextLink href="/guide" legacyBehavior>
              <Link className=" !cursor-pointer !text-districtrLightBlue">Guide</Link>
            </NextLink>
            <NextLink href="/about" legacyBehavior>
              <Link className=" !cursor-pointer !text-districtrLightBlue">About</Link>
            </NextLink>
            <NextLink href="/updates" legacyBehavior>
              <Link className=" !cursor-pointer !text-districtrLightBlue">Updates</Link>
            </NextLink>
          </Flex>

          <Flex direction="column" className="text-white">
            <Text className="text-white font-bold mb-4" size="2">
              GET IN TOUCH
            </Text>

            <NextLink href="/contact" legacyBehavior>
              <Link className=" !cursor-pointer !text-districtrLightBlue">Contact</Link>
            </NextLink>
            <NextLink href="https://mggg.org/" legacyBehavior>
              <Link target="_blank" className="!cursor-pointer !text-districtrLightBlue">
                MGGG
              </Link>
            </NextLink>
          </Flex>
        </Grid>
      </Box>
    </Box>
    <Box className="m-0 bg-gray-300">
      <Flex
        direction="row"
        justify="start"
        className="mx-auto max-w-screen-lg"
        align="center"
        gap="2"
      >
        <Text className="text-center my-1" size="2">
          Copyright 2025, MGGG. All rights reserved.
        </Text>
        <NextLink href="/admin/cms" legacyBehavior>
          <Link size="2">Admin Login</Link>
        </NextLink>
      </Flex>
    </Box>
  </>
);
