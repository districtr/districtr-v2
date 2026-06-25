'use client';
import React from 'react';
import NextLink from 'next/link';
import {usePathname} from 'next/navigation';
import {Flex, Link} from '@radix-ui/themes';

export interface SecondaryNavItem {
  label: string;
  href: string;
}

/**
 * A second-order (sub) nav bar for a section of content pages (e.g. Learn).
 * Renders a row of links and highlights the one matching the current route.
 */
export const SecondaryNav: React.FC<{items: SecondaryNavItem[]}> = ({items}) => {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Section"
      className="border-b border-gray-200 mb-4 pb-2 sticky top-[64px] bg-white z-[9000]"
    >
      <Flex direction="row" gapX="5" align="center" className="text-sm tracking-wider overflow-x-auto">
        {items.map(item => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              asChild
              weight={active ? 'bold' : 'regular'}
              color={active ? undefined : 'gray'}
              className={`whitespace-nowrap !cursor-pointer ${active ? '!text-districtrBlue' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <NextLink href={item.href}>{item.label}</NextLink>
            </Link>
          );
        })}
      </Flex>
    </nav>
  );
};
