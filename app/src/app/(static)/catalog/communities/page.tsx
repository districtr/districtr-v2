import {ManageMapsPage} from '@/app/components/ManageMaps/ManageMapsPage';
import {MAP_TABS} from '@constants/document/tabs';

export const metadata = {
  title: 'Community Catalog',
  description: 'Browse and manage your community maps',
};

export default function CommunitiesPage() {
  return <ManageMapsPage mapType={MAP_TABS.COMMUNITY} />;
}
