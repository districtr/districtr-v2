import React from 'react';
import {Box, Flex, Grid, Heading, Link, Text} from '@radix-ui/themes';
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
            <Link href="/">
              <Heading as="h3" className="text-lg font-bold text-white cursor-pointer">
                Districtr
              </Heading>
            </Link>
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
            <Link href="/places" className=" !cursor-pointer !text-districtrLightBlue">
              List
            </Link>
            <Link href="/tags" className=" !cursor-pointer !text-districtrLightBlue">
              Tags
            </Link>
            <PlaceMapModal>
              <Link className=" !cursor-pointer !text-districtrLightBlue">Map</Link>
            </PlaceMapModal>
          </Flex>
          <Flex direction="column" className="text-white">
            <Text className="text-white font-bold mb-4" size="2">
              LEARN MORE
            </Text>

            <Link href="/about" className=" !cursor-pointer !text-districtrLightBlue">
              About
            </Link>
            <Link href="/guide" className=" !cursor-pointer !text-districtrLightBlue">
              Guide
            </Link>
            <Link href="/data" className=" !cursor-pointer !text-districtrLightBlue">
              Data
            </Link>
            <Link href="/rules" className=" !cursor-pointer !text-districtrLightBlue">
              Rules
            </Link>
            <Link href="/updates" className=" !cursor-pointer !text-districtrLightBlue">
              Updates
            </Link>
          </Flex>

          <Flex direction="column" className="text-white">
            <Text className="text-white font-bold mb-4" size="2">
              BIG PICTURE
            </Text>

            <Link href="/contact" className=" !cursor-pointer !text-districtrLightBlue">
              Contact
            </Link>
            <Link
              href="https://mggg.org/"
              target="_blank"
              className="!cursor-pointer !text-districtrLightBlue"
            >
              Data and Democracy Lab
            </Link>
            <Link
              href="https://github.com/districtr/districtr-v2"
              target="_blank"
              className="!cursor-pointer !text-districtrLightBlue"
            >
              GitHub
            </Link>
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
        <Text className="text-center my-1" size="3">
          Copyright 2025, Data and Democracy Lab. All rights reserved.
        </Text>
        <Link href="/admin/cms">Admin Login</Link>
      </Flex>
    </Box>
  </>
);
