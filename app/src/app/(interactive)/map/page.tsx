import MapPage from '@/app/components/MapPage/MapPage';
import {redirect} from 'next/navigation';
import {generateMapPageMetadata} from '@/app/utils/metadata/pageMetadataUtils';
import {routeManager} from '@/app/utils/map/mapUrlRoute';

export const generateMetadata = generateMapPageMetadata;

export default async function Map({
  searchParams,
}: {
  searchParams: Promise<{document_id?: string | string[] | undefined}>;
}) {
  const params = await searchParams;
  // if params.document_id is not undefined, redirect to {document_id}/edit
  if (params.document_id) {
    return redirect(`/${routeManager.mapUrlRoute}/${params.document_id}/edit`);
  }

  return <MapPage isEditing={false} mapId="" />;
}
