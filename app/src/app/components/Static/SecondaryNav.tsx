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
 * A second-order (sub) nav bar for a section of content pages (e.g. Learn,
 * Catalog). Renders a row of links and highlights the one matching the current
 * route. Sticks flush under the main Header — `top-16` must stay equal to the
 * Header's `h-16` so the white bar has no see-through gap when scrolled.
 *
 * `floating` renders it as a hover preview instead: absolutely positioned flush
 * under its (positioned) parent rather than stuck to the viewport.
 */
export const SecondaryNav: React.FC<{items: SecondaryNavItem[]; floating?: boolean}> = ({
  items,
  floating,
}) => {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Section"
      className={`border-b border-gray-200 py-2 bg-white ${
        floating ? 'absolute top-full left-0 right-0 shadow-md' : 'mb-4 sticky top-16 z-[9000]'
      }`}
    >
      <Flex
        direction="row"
        gapX="5"
        align="center"
        justify="center"
        className="text-sm tracking-wider overflow-x-auto"
      >
        {items.map(item => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              asChild
              weight={active ? 'bold' : 'regular'}
              color={active ? undefined : 'gray'}
              className={`whitespace-nowrap !cursor-pointer !underline-offset-4 hover:!underline hover:!decoration-2 hover:!text-districtrBlue ${active ? '!text-districtrBlue' : ''}`}
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
