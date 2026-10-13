import React from 'react';
import {SecondaryNav, SecondaryNavItem} from './SecondaryNav';

export const CATALOG_ITEMS: SecondaryNavItem[] = [
  {label: 'My district plans', href: '/catalog'},
  {label: 'My community maps', href: '/catalog/communities'},
  {label: 'General plan directory', href: '/catalog/directory'},
];

/** Second-order nav bar shown across the Catalog pages. */
export const CatalogSubNav: React.FC = () => <SecondaryNav items={CATALOG_ITEMS} />;
