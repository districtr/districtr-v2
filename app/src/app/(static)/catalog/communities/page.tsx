import {ManageMapsPage} from '@/app/components/ManageMaps/ManageMapsPage';
import {MAP_TABS} from '@constants/document/tabs';

export default function CommunitiesPage() {
  return <ManageMapsPage mapType={MAP_TABS.COMMUNITY} />;
}
