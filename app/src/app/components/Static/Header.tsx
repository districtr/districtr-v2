'use client';
import React, {useState} from 'react';
import {Box, DropdownMenu, Flex, Heading, IconButton} from '@radix-ui/themes';
import Image from 'next/image';
import NextLink from 'next/link';
import {Link} from '@radix-ui/themes';
import {PlaceMapModal} from './PlaceMap/PlaceMapModal';
import {HamburgerMenuIcon} from '@radix-ui/react-icons';

export const Header: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);

  const linkItems = [
    <NextLink legacyBehavior href="/about" key={`link-items-1`}>
      <Link className="!font-bold !cursor-pointer">About Districtr</Link>
    </NextLink>,
    <NextLink legacyBehavior href="/guide" key={`link-items-2`}>
      <Link className="!font-bold !cursor-pointer">Guide</Link>
    </NextLink>,
    <NextLink legacyBehavior href="/data" key={`link-items-3`}>
      <Link className="!font-bold !cursor-pointer">Data</Link>
    </NextLink>,
    <NextLink legacyBehavior href="/rules" key={`link-items-4`}>
      <Link className="!font-bold !cursor-pointer">Rules of Redistricting</Link>
    </NextLink>,
    <Link className="!font-bold !cursor-pointer" onClick={() => setModalOpen(true)}>
      Start Mapping
    </Link>,
  ];

  return (
    <>
      <Box className="p-4 bg-gray-100 sticky top-0 shadow-sm z-[10000]">
        <Flex direction="row" justify="between" className="mx-auto max-w-screen-lg">
          <Heading size="4" className="site-title text-districtrBlue">
            <a href="/">Districtr</a>
          </Heading>
          <Flex direction="row" gapX="4" className="text-sm tracking-wider !hidden md:!flex">
            {linkItems.map((item, index) => (
              <React.Fragment key={index}>{item}</React.Fragment>
            ))}
          </Flex>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <IconButton variant="ghost" className="md:!hidden" size="3">
                <HamburgerMenuIcon />
              </IconButton>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content className="p-2" size="2">
              {linkItems.map((item, index) => (
                <DropdownMenu.Item key={index}>{item}</DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </Flex>
      </Box>
      <PlaceMapModal _open={modalOpen} _setOpen={setModalOpen}>
        <></>
      </PlaceMapModal>
    </>
  );
};
