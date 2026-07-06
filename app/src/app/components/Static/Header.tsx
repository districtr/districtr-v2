'use client';
import React, {useState} from 'react';
import {Box, DropdownMenu, Flex, IconButton, Link} from '@radix-ui/themes';
import NextLink from 'next/link';
import {usePathname} from 'next/navigation';
import {HamburgerMenuIcon} from '@radix-ui/react-icons';
import {SecondaryNav, SecondaryNavItem} from './SecondaryNav';
import {LEARN_ITEMS} from './LearnSubNav';
import {CATALOG_ITEMS} from './CatalogSubNav';

const NAV_ITEMS: {
  label: string;
  href: string;
  match: (pathname: string) => boolean;
  subnav?: SecondaryNavItem[];
}[] = [
  // Learn is a section (About/Guide/Data/Rules); the link lands on the first page
  // and the in-page subnav (LearnSubNav) handles movement within the section.
  {
    label: 'Learn',
    href: '/about',
    match: p => ['/about', '/guide', '/data', '/rules'].includes(p),
    subnav: LEARN_ITEMS,
  },
  // Draw owns the place-picker landing pages too, so it stays active on /draw,
  // the all-places directory, and individual state pages.
  {
    label: 'Draw',
    href: '/draw',
    match: p => p === '/draw' || p === '/places' || p.startsWith('/place/'),
  },
  {
    label: 'Catalog',
    href: '/catalog',
    match: p => p.startsWith('/catalog') || p === '/my-maps',
    subnav: CATALOG_ITEMS,
  },
];

export const Header: React.FC = () => {
  const pathname = usePathname();
  const [hovered, setHovered] = useState<(typeof NAV_ITEMS)[number] | null>(null);

  const linkItems = NAV_ITEMS.map(item => {
    const active = item.match(pathname);
    return (
      <Link
        key={item.href}
        asChild
        size="5"
        weight="bold"
        color={active ? undefined : 'gray'}
        className={`!cursor-pointer rounded-full px-3 py-1 transition-colors ${
          active ? 'bg-districtrLightBlue !text-districtrBlue' : 'hover:bg-gray-200'
        }`}
        aria-current={active ? 'page' : undefined}
        onMouseEnter={() => setHovered(item)}
      >
        <NextLink href={item.href}>{item.label}</NextLink>
      </Link>
    );
  });

  return (
    <Box
      className="h-16 px-4 bg-gray-100 sticky top-0 shadow-sm z-[10000] flex items-center"
      onMouseLeave={() => setHovered(null)}
    >
      <Flex
        direction="row"
        justify="between"
        align="center"
        className="mx-auto max-w-screen-lg w-full"
      >
        <Link asChild size="5" weight="bold" className="site-title !text-districtrBlue">
          <a href="/">Districtr</a>
        </Link>
        <Flex direction="row" gapX="2" align="center" className="tracking-wider !hidden md:!flex">
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
      {hovered?.subnav && !hovered.match(pathname) && (
        <SecondaryNav floating items={hovered.subnav} />
      )}
    </Box>
  );
};
