import React from 'react';
import {Flex, Heading} from '@radix-ui/themes';
import Image from 'next/image';
import NextLink from 'next/link';
import { Link } from '@radix-ui/themes';
import { PlaceMapModal } from './PlaceMap/PlaceMapModal';

export const Header: React.FC = () => (
  <Flex direction="row" justify={"between"} className="p-4 bg-gray-50 sticky top-0 shadow-sm">
    <Heading size="4" className="site-title text-districtrBlue">
      <a href="/">Districtr</a>
    </Heading>
    <Flex direction="row" gapX="4" className="text-sm tracking-wider">
      <NextLink legacyBehavior href="/about"><Link>HOW TO USE</Link></NextLink>
      <PlaceMapModal />
      <NextLink legacyBehavior href="/about"><Link>ABOUT</Link></NextLink>
      <NextLink legacyBehavior href="/updates"><Link>WHAT&apos;S NEW?</Link></NextLink>
      <NextLink legacyBehavior href="https://mggg.org/" target="_blank" >
        <Image src="/mggg.svg" alt="MGGG" width={100} height={50} className='cursor-pointer' />
      </NextLink>
    </Flex>
  </Flex>
);