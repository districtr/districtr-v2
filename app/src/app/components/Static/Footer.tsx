import React from 'react';
import {Box, Flex, Grid, Heading, Link, Text} from '@radix-ui/themes';
import NextLink from 'next/link';
import Image from 'next/image';
import {PlaceMapModal} from './PlaceMap/PlaceMapModal';

export const Footer: React.FC = () => (
  <>
    <Box className="p-4 mt-12 bg-gray-800">
      <Box id="footer-content" className="mx-auto max-w-screen-lg">
        <Grid
          columns={{
            initial: '1',
            md: '2',
            lg: '4',
          }}
          gap="9"
        >
          <Flex direction="column" gapY="4">
            <NextLink href="/">
              <Heading as="h3" className="text-lg font-bold text-white cursor-pointer">
                Districtr
              </Heading>
            </NextLink>
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
              <Link className=" !cursor-pointer !text-districtrLightBlue">List</Link>
            </NextLink>
            <NextLink href="/tags" legacyBehavior>
              <Link className=" !cursor-pointer !text-districtrLightBlue">Tags</Link>
            </NextLink>
            <PlaceMapModal>
              <Link className=" !cursor-pointer !text-districtrLightBlue">Map</Link>
            </PlaceMapModal>
          </Flex>
          <Flex direction="column" className="text-white">
            <Text className="text-white font-bold mb-4" size="2">
              LEARN MORE
            </Text>

            <NextLink href="/about" legacyBehavior>
              <Link className=" !cursor-pointer !text-districtrLightBlue">About</Link>
            </NextLink>
            <NextLink href="/guide" legacyBehavior>
              <Link className=" !cursor-pointer !text-districtrLightBlue">Guide</Link>
            </NextLink>
            <NextLink href="/data" legacyBehavior>
              <Link className=" !cursor-pointer !text-districtrLightBlue">Data</Link>
            </NextLink>
            <NextLink href="/rules" legacyBehavior>
              <Link className=" !cursor-pointer !text-districtrLightBlue">Rules</Link>
            </NextLink>
            <NextLink href="/updates" legacyBehavior>
              <Link className=" !cursor-pointer !text-districtrLightBlue">Updates</Link>
            </NextLink>
          </Flex>

          <Flex direction="column" className="text-white">
            <Text className="text-white font-bold mb-4" size="2">
              BIG PICTURE
            </Text>

            <NextLink href="/contact" legacyBehavior>
              <Link className=" !cursor-pointer !text-districtrLightBlue">Contact</Link>
            </NextLink>
            <NextLink href="https://mggg.org/" legacyBehavior>
              <Link target="_blank" className="!cursor-pointer !text-districtrLightBlue">
                Data and Democracy Lab
              </Link>
            </NextLink>
            <NextLink href="https://github.com/districtr/districtr-v2" legacyBehavior>
              <Link target="_blank" className="!cursor-pointer !text-districtrLightBlue">
                GitHub
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
          Copyright 2025, Data and Democracy Lab. All rights reserved.
        </Text>
        <NextLink href="/admin/cms" legacyBehavior>
          <Link size="2">Admin Login</Link>
        </NextLink>
      </Flex>
    </Box>
  </>
);
