import {ManageMapsPage} from '@/app/components/ManageMaps/ManageMapsPage';
import {MAP_TABS} from '@constants/document/tabs';

export const metadata = {
  title: 'Map Catalog',
  description: 'Browse and manage your districting maps',
};

export default function CatalogPage() {
  return <ManageMapsPage mapType={MAP_TABS.DISTRICTS} />;
}
