import React from 'react';
import {SecondaryNav, SecondaryNavItem} from './SecondaryNav';

const LEARN_ITEMS: SecondaryNavItem[] = [
  {label: 'About', href: '/about'},
  {label: 'Guide', href: '/guide'},
  {label: 'Data', href: '/data'},
  {label: 'Rules of Redistricting', href: '/rules'},
];

/** Second-order nav bar shown across the Learn content pages. */
export const LearnSubNav: React.FC = () => <SecondaryNav items={LEARN_ITEMS} />;
