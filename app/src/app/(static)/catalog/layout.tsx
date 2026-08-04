import React from 'react';
import {CatalogSubNav} from '@/app/components/Static/CatalogSubNav';

export default function CatalogLayout({children}: {children: React.ReactNode}) {
  return (
    <>
      <CatalogSubNav />
      {children}
    </>
  );
}
