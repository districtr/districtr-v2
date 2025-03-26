import React from 'react';
import {DropdownMenu, Flex, Heading, IconButton} from '@radix-ui/themes';
import Image from 'next/image';
import NextLink from 'next/link';
import {Link} from '@radix-ui/themes';
import {PlaceMapModal} from './PlaceMap/PlaceMapModal';
import {HamburgerMenuIcon} from '@radix-ui/react-icons';

export const Header: React.FC = () => {
  const linkItems = [
    <NextLink legacyBehavior href="/guide">
      <Link>GET STARTED</Link>
    </NextLink>,
    <PlaceMapModal />,
    <NextLink legacyBehavior href="/about">
      <Link>ABOUT</Link>
    </NextLink>,
    <NextLink legacyBehavior href="/updates">
      <Link>WHAT&apos;S NEW?</Link>
    </NextLink>,
    <NextLink legacyBehavior href="https://mggg.org/" target="_blank">
      <Image src="/mggg.svg" alt="MGGG" width={100} height={50} className="cursor-pointer" />
    </NextLink>,
  ];

  return (
    <Flex direction="row" justify={'between'} className="p-4 bg-gray-100 sticky top-0 shadow-sm">
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
  );
};
