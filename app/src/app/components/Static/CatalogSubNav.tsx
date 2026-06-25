import React from 'react';
import {SecondaryNav, SecondaryNavItem} from './SecondaryNav';

const CATALOG_ITEMS: SecondaryNavItem[] = [
  {label: 'My District Plans', href: '/catalog'},
  {label: 'My Community Maps', href: '/catalog/communities'},
  {label: 'Official Plan Directory', href: '/catalog/directory'},
];

/** Second-order nav bar shown across the Catalog pages. */
export const CatalogSubNav: React.FC = () => <SecondaryNav items={CATALOG_ITEMS} />;
