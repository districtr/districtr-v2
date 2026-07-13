'use client';
import React, {useState} from 'react';
import {Box, DropdownMenu, Flex, IconButton, Link} from '@radix-ui/themes';
import NextLink from 'next/link';
import {usePathname} from 'next/navigation';
import {HamburgerMenuIcon} from '@radix-ui/react-icons';
import {SecondaryNavItem} from './SecondaryNav';
import {LEARN_ITEMS} from './LearnSubNav';
import {CATALOG_ITEMS} from './CatalogSubNav';

// Draw has no in-page subnav; this exists so its hover dropdown is parallel
// with the other top-level items.
const DRAW_ITEMS: SecondaryNavItem[] = [{label: 'Jump to the map', href: '/draw'}];

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
    subnav: DRAW_ITEMS,
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

  const navLink = (item: (typeof NAV_ITEMS)[number]) => {
    const active = item.match(pathname);
    return (
      <Link
        asChild
        size="5"
        weight="bold"
        color={active ? undefined : 'gray'}
        className={`!cursor-pointer rounded-full px-3 py-1 transition-colors ${
          active ? 'bg-districtrLightBlue !text-districtrBlue' : 'hover:bg-gray-200'
        }`}
        aria-current={active ? 'page' : undefined}
      >
        <NextLink href={item.href}>{item.label}</NextLink>
      </Link>
    );
  };

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
          {NAV_ITEMS.map(item => (
            <div key={item.href} className="relative" onMouseEnter={() => setHovered(item)}>
              {navLink(item)}
              {/* The section's pages preview as a dropdown anchored to its
                  nav item; the padding bridges the hover gap to the panel. */}
              {hovered === item && item.subnav && (
                <div className="absolute left-0 top-full z-[10001] pt-3">
                  <nav
                    aria-label={`${item.label} section`}
                    className="min-w-max rounded-lg border border-gray-200 bg-white py-1 shadow-md"
                  >
                    {item.subnav.map(sub => (
                      <Link
                        key={sub.href}
                        asChild
                        size="2"
                        color="gray"
                        className="block whitespace-nowrap px-4 py-1.5 !cursor-pointer hover:bg-gray-100 hover:!text-districtrBlue"
                      >
                        <NextLink href={sub.href}>{sub.label}</NextLink>
                      </Link>
                    ))}
                  </nav>
                </div>
              )}
            </div>
          ))}
        </Flex>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <IconButton variant="ghost" className="md:!hidden" size="3">
              <HamburgerMenuIcon />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content className="p-2" size="2">
            {NAV_ITEMS.map(item => (
              <DropdownMenu.Item key={item.href}>{navLink(item)}</DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </Flex>
    </Box>
  );
};
